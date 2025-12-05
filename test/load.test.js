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
  // This could take a while depending on the load
  setupTimeout: '10m',
  teardownTimeout: '10m',
  thresholds: {
    'http_req_duration{page_loaded:1}': ['p(99)<3000'], // 99% of requests must complete below 3s
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

const folderUIDBase = "load-test-folder-";

function deleteFolder(url, uid, commonRequestParams) {
  let deleteResponse = http.del(`${url}/api/folders/${uid}?forceDeleteRules=true`, null, commonRequestParams);
  console.log(`Folder deletion response status: ${deleteResponse.status}`);
  console.log(`Folder deletion response body: ${deleteResponse.body}`);
  return deleteResponse;
}

export function setup() {
  const { url, token, username, password } = ensureConfig();
  let commonRequestParams = buildRequestParams(username, password, token);
  let alertRuleCount = envOrDefault("ALERT_RULE_COUNT", 100_000);
  let recordingRuleCount = envOrDefault("RECORDING_RULE_COUNT", 100_000);
  let folderCount = envOrDefault("FOLDER_COUNT", 1_000);
  let rulesPerGroup = envOrDefault("RULES_PER_GROUP", 100);
  let groupsPerFolder = ((alertRuleCount + recordingRuleCount) / rulesPerGroup) / folderCount;
  let folderUIDs = [];
  for (let i = 1; i <= folderCount; i++) {
    let folderUID = `${folderUIDBase}${i}`;
    let folderReqBody = {
      uid: folderUID,
      title: `Load Test Folder ${i}`,
      description: "Folder created for example load test",
    }
    let existingFoldersResp = http.get(`${url}/api/folders/${folderUID}`, commonRequestParams);
    if (existingFoldersResp.status === 200) {
      console.log(`Folder with UID ${folderUID} already exists. Cleaning up before test.`);
      deleteFolder(url, folderUIDBase, commonRequestParams);
    }
    let response = http.post(`${url}/api/folders`, JSON.stringify(folderReqBody), commonRequestParams)
    console.log(`Folder creation response status: ${response.status}`);
    console.log(`Folder creation response body: ${response.body}`);
    folderUIDs.push(folderUID);
  }
  // generate
  let input = {
    alertRuleCount,
    recordingRuleCount,
    queryDatasource: "__expr__",
    writeDatasource: "write_ds_id",
    rulesPerGroup,
    groupsPerFolder,
    uploadConfig: {
      grafanaURL: url,
      token: token,
      username: token ? '' : username,
      password: token ? '' : password,
      orgId: 1,
      folderUIDs,
    },
  };
  console.log("Generating test data with input:", input);
  let output = GenerateGroups(input);
  return { output, commonRequestParams, url, folderUIDs };
}

export default function ({ output: { groups, inputConfig }, commonRequestParams, url }) {
  // verify the rules are created in grafana prometheus api as expected
  console.log("Verifying created rules in Grafana", inputConfig);
  let prometheusResponse = http.get(`${url}/api/prometheus/grafana/api/v1/rules?group_limit=40`, {
    tags: {
      page_loaded: "1",
    },
    ...commonRequestParams,
  });
  console.log(`Prometheus rules API response status: ${prometheusResponse.status}`);
  let prometheusData = JSON.parse(prometheusResponse.body);
  console.log(`Prometheus rules API response body: ${prometheusResponse.body}`);
  let allGroups = prometheusData.data.groups;
  expect(allGroups.length).toBe(40);
}

export function teardown({ commonRequestParams, url, folderUIDs }) {
  // delete the created folder and its contents
  console.log("Tearing down test data in Grafana");
  for (const folderUID of folderUIDs) {
    deleteFolder(url, folderUID, commonRequestParams);
  }
}
