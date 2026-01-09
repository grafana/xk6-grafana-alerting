import { GenerateGroups } from "k6/x/grafana-alerting";
import http from "k6/http";
import { expect } from "https://jslib.k6.io/k6-testing/0.6.1/index.js";
import { envOrDefault, ensureConfig, buildRequestParams } from "./config.js";

export const options = {
  // This could take a while depending on the load.
  setupTimeout: "10m",
  teardownTimeout: "10m",
  vus: 100,
  duration: "1m",
  thresholds: {
    "http_req_duration{page_loaded:1}": ["p(99)<3000"], // 99% of requests must complete below 3s.
    "http_req_failed{page_loaded:1}": ["rate<0.01"], // Less than 1% failed requests.
  },
};

const folderUIDBase = "load-test-folder-";

export function setup() {
  const { url, token, username, password } = ensureConfig();
  const commonRequestParams = buildRequestParams(username, password, token);
  const numAlerting = envOrDefault("ALERT_RULE_COUNT", 100);
  const numRecording = envOrDefault("RECORDING_RULE_COUNT", 100);
  const rulesPerGroup = envOrDefault("RULES_PER_GROUP", 10);
  const groupsPerFolder = envOrDefault("GROUPS_PER_FOLDER", 5);

  let input = {
    nuke: true, // Delete all auto-gen folders before starting.
    numAlerting,
    numRecording,
    rulesPerGroup,
    groupsPerFolder,
    grafanaURL: url,
    token: token,
    username: token ? "" : username,
    password: token ? "" : password,
    orgId: 1,
    concurrency: 100,
  };

  console.log("Creating test data in Grafana");
  GenerateGroups(input);
  return { commonRequestParams, url };
}

export default function ({ commonRequestParams, url }) {
  const dataSource = "grafanacloud-prom";
  const name = "A"; // Any rules containing an "A" in its name.
  const groupLimit = 40;

  const prometheusResponse = http.get(
    `${url}/api/prometheus/grafana/api/v1/rules?group_limit=${groupLimit}&datasource_uid=${dataSource}&search.rule_name=${name}`,
    {
      tags: {
        page_loaded: "1",
      },
      ...commonRequestParams,
    },
  );
  const prometheusData = JSON.parse(prometheusResponse.body);
  const groups = prometheusData.data.groups;

  // Check that the limit is being applied.
  expect(groups.length).toBeLessThanOrEqual(groupLimit);

  // Check that all rules in all groups are querying the expected data source.
  for (const group of groups) {
    for (const rule of group.rules) {
      expect(rule.queriedDatasourceUIDs).toContain(dataSource);
    }
  }
}

export function teardown() {
  const { url, token, username, password } = ensureConfig();
  console.log("Tearing down test data in Grafana");
  GenerateGroups({
    nuke: true, // Delete all auto-gen data.
    grafanaURL: url,
    token: token,
    username: token ? "" : username,
    password: token ? "" : password,
  });
}
