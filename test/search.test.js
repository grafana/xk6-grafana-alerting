import { GenerateGroups } from "k6/x/grafana-alerting";
import http from "k6/http";
import encoding from "k6/encoding";
import { expect } from "https://jslib.k6.io/k6-testing/0.6.1/index.js";

function envOrDefault(envVarName, def) {
  const envVar = __ENV[envVarName];
  return envVar ?? def;
}

// ensureConfig ensures the simulation has valid parameters and builds a Grafana API for simulation testing.
function ensureConfig() {
  return {
    url: envOrDefault("GRAFANA_URL", "http://localhost:3000"),
    username: envOrDefault("GRAFANA_ADMIN_USER", "admin"),
    password: envOrDefault("GRAFANA_ADMIN_PASSWORD", "admin"),
    token: envOrDefault("GRAFANA_API_TOKEN", ""),
  };
}

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

function buildRequestParams(username, password, token) {
  let params = {
    auth: "basic",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${encoding.b64encode(`${username}:${password}`)}`,
    },
  };
  if (!token) {
    return params;
  }
  params.headers["Authorization"] = `Bearer ${token}`;
  delete params.auth;
  return params;
}

const folderUIDBase = "load-test-folder-";

export function setup() {
  const { url, token, username, password } = ensureConfig();
  let commonRequestParams = buildRequestParams(username, password, token);
  let numAlerting = envOrDefault("ALERT_RULE_COUNT", 100);
  let numRecording = envOrDefault("RECORDING_RULE_COUNT", 100);
  let rulesPerGroup = envOrDefault("RULES_PER_GROUP", 10);
  let groupsPerFolder = envOrDefault("GROUPS_PER_FOLDER", 5);

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
  let output = GenerateGroups(input);
  return { output, commonRequestParams, url };
}

export default function ({ commonRequestParams, url }) {
  const dataSource = "grafanacloud-prom";
  let prometheusResponse = http.get(
    `${url}/api/prometheus/grafana/api/v1/rules?group_limit=40&datasource_uid=${dataSource}`,
    {
      tags: {
        page_loaded: "1",
      },
      ...commonRequestParams,
    },
  );
  let prometheusData = JSON.parse(prometheusResponse.body);
  const groups = prometheusData.data.groups;

  // Check that the limit is being applied.
  expect(groups.length).toBeLessThanOrEqual(40);

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
