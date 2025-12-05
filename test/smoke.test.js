// TODO: add some smoke tests
import { GenerateGroups } from "k6/x/grafana-alerting";
import http from "k6/http";
import encoding from 'k6/encoding';
import { expect } from "https://jslib.k6.io/k6-testing/0.6.1/index.js";

function envOrDefault(envVarName, def) {
  const envVar = __ENV[envVarName];
  return envVar ?? def;
}

// Ensures simulation has valid parameters and builds a grafana api for
// simulation testing
function ensureConfig() {
  return {
    url: envOrDefault('GRAFANA_URL', 'http://localhost:3000'),
    username: envOrDefault('GRAFANA_ADMIN_USER', 'admin'),
    password: envOrDefault('GRAFANA_ADMIN_PASSWORD', 'admin'),
    token: envOrDefault('GRAFANA_API_TOKEN', ''),
  };
}

export const options = {
  thresholds: {
    'http_req_duration{filter:folder_uid}': ['p(99)<3000'], // 99% of requests must complete below 3s
  },
}

function buildRequestParams(username, password, token) {
  let params = {
    auth: 'basic',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encoding.b64encode(`${username}:${password}`)}`,
    }
  };
  if (!token) {
    return params
  }
  params.headers['Authorization'] = `Bearer ${token}`;
  delete params.auth
  return params;
}

const folderUID = "smoke-test-folder";

function deleteFolder(url, uid, commonRequestParams) {
  let deleteResponse = http.del(`${url}/api/folders/${uid}?forceDeleteRules=true`, null, commonRequestParams);
  console.log(`Folder deletion response status: ${deleteResponse.status}`);
  console.log(`Folder deletion response body: ${deleteResponse.body}`);
  return deleteResponse;
}

export function setup() {
  const { url, token, username, password } = ensureConfig();
  let commonRequestParams = buildRequestParams(username, password, token);

  let folderReqBody = {
    uid: folderUID,
    title: "Smoke Test Folder",
    description: "Folder created for smoke test of k6 grafana alerting extension",
  }
  let existingFoldersResp = http.get(`${url}/api/folders/${folderUID}`, commonRequestParams);
  if (existingFoldersResp.status === 200) {
    console.log(`Folder with UID ${folderUID} already exists. Cleaning up before test.`);
    deleteFolder(url, folderUID, commonRequestParams);
  }
  let response = http.post(`${url}/api/folders`, JSON.stringify(folderReqBody), commonRequestParams)
  console.log(`Folder creation response status: ${response.status}`);
  console.log(`Folder creation response body: ${response.body}`);
  // generate a single group with 1 recording and 1 alerting rule in the folder
  let input = {
    alertRuleCount: 1,
    recordingRuleCount: 1,
    queryDatasource: "__expr__",
    writeDatasource: "write_ds_id",
    rulesPerGroup: 2,
    groupsPerFolder: 1,
    seed: 1764919953738342000,
    uploadConfig: {
      grafanaURL: url,
      token: token,
      username: token ? '' : username,
      password: token ? '' : password,
      orgId: 1,
      folderUIDs: [folderUID],
    },
  };
  console.log("Generating test data with input:", input);
  let output = GenerateGroups(input);
  return { output, commonRequestParams, url };
}

export default function ({ output: { groups, inputConfig }, commonRequestParams, url }) {
  // verify the rules are created in grafana prometheus api as expected
  console.log("Verifying created rules in Grafana", inputConfig);
  let prometheusResponse = http.get(`${url}/api/prometheus/grafana/api/v1/rules?group_limit=40&folder_uid=${folderUID}`, {
    tags: {
      filter: "folder_uid",
    },
    ...commonRequestParams,
  });
  console.log(`Prometheus rules API response status: ${prometheusResponse.status}`);
  let prometheusData = JSON.parse(prometheusResponse.body);
  console.log(`Prometheus rules API response body: ${prometheusResponse.body}`);
  let allGroups = prometheusData.data.groups;
  console.log(`Total groups retrieved from Grafana Prometheus API: ${allGroups.length}`);
  let testFolderGroups = allGroups.filter(g => g.folderUid === folderUID);
  console.log(`Total groups in test folder: ${testFolderGroups.length}`);
  expect(testFolderGroups.length).toBe(groups.length);
}

export function teardown({ commonRequestParams, url }) {
  // delete the created folder and its contents
  console.log("Tearing down test data in Grafana");
  deleteFolder(url, folderUID, commonRequestParams);
}
