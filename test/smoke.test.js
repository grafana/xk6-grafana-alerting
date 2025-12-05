// TODO: add some smoke tests
import { GenerateGroups } from "k6/x/grafana-alerting";
import http from "k6/http";
import encoding from 'k6/encoding';
import { expect } from "https://jslib.k6.io/k6-testing/0.6.1/index.js";

export const options = {
  thresholds: {
    checks: ["rate==1"],
  },
}

const GRAFANA_URL = "http://localhost:3000";
const GRAFANA_ADMIN_USER = "admin";
const GRAFANA_ADMIN_PASSWORD = "admin";

const commonRequestParams = {
  auth: 'basic',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${encoding.b64encode(`${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}`)}`,
  }
};

const folderUID = "smoke-test-folder";

function deleteFolder(uid) {
  let deleteResponse = http.del(`${GRAFANA_URL}/api/folders/${folderUID}?forceDeleteRules=true`, null, commonRequestParams);
  console.log(`Folder deletion response status: ${deleteResponse.status}`);
  console.log(`Folder deletion response body: ${deleteResponse.body}`);
  return deleteResponse;
}

export function setup() {
  // TODO: setup folder
  let folderReqBody = {
    uid: folderUID,
    title: "Smoke Test Folder",
    description: "Folder created for smoke test of k6 grafana alerting extension",
  }
  let existingFoldersResp = http.get(`${GRAFANA_URL}/api/folders/${folderUID}`, commonRequestParams);
  if (existingFoldersResp.status === 200) {
    console.log(`Folder with UID ${folderUID} already exists. Cleaning up before test.`);
    deleteFolder(folderUID);
  }
  let response = http.post(`${GRAFANA_URL}/api/folders`, JSON.stringify(folderReqBody), commonRequestParams)
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
      grafanaURL: GRAFANA_URL,
      username: GRAFANA_ADMIN_USER,
      password: GRAFANA_ADMIN_PASSWORD,
      orgId: 1,
      folderUIDs: [folderUID],
    },
  };
  console.log("Generating test data with input:", input);
  let output = GenerateGroups(input);
  return output;
}

export default function ({ groups, input_config }) {
  // verify the rules are created in grafana prometheus api as expected
  console.log("Verifying created rules in Grafana", input_config);
  let prometheusResponse = http.get(`${GRAFANA_URL}/api/prometheus/grafana/api/v1/rules?group_limit=40`, commonRequestParams);
  console.log(`Prometheus rules API response status: ${prometheusResponse.status}`);
  let prometheusData = JSON.parse(prometheusResponse.body);
  console.log(`Prometheus rules API response body: ${prometheusResponse.body}`);
  let allGroups = prometheusData.data.groups;
  console.log(`Total groups retrieved from Grafana Prometheus API: ${allGroups.length}`);
  let testFolderGroups = allGroups.filter(g => g.folderUid === folderUID);
  console.log(`Total groups in test folder: ${testFolderGroups.length}`);
  expect(testFolderGroups.length).toBe(groups.length);
}

export function teardown({ groups, input_config }) {
  // delete the created folder and its contents
  console.log("Tearing down test data in Grafana");
  deleteFolder(folderUID);
}
