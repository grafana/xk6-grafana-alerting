import { GenerateGroups } from "k6/x/grafana-alerting";
import http from "k6/http";
import encoding from 'k6/encoding';
import { expect } from "https://jslib.k6.io/k6-testing/0.6.1/index.js";

function envOrDefault(envVarName, def) {
  const envVar = __ENV[envVarName];
  return envVar ?? def;
}

// Ensures simulation has valid parameters and builds a grafana api for simulation testing.
function ensureConfig() {
  return {
    url: envOrDefault('GRAFANA_URL', 'http://localhost:3000'),
    username: envOrDefault('GRAFANA_ADMIN_USER', 'admin'),
    password: envOrDefault('GRAFANA_ADMIN_PASSWORD', 'admin'),
    token: envOrDefault('GRAFANA_API_TOKEN', ''),
  };
}

export const options = {
  // This could take a while depending on the load.
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

export function setup() {
  const { url, token, username, password } = ensureConfig();
  let commonRequestParams = buildRequestParams(username, password, token);
  let numAlerting = envOrDefault("ALERT_RULE_COUNT", 100);
  let numRecording = envOrDefault("RECORDING_RULE_COUNT", 100);
  let rulesPerGroup = envOrDefault("RULES_PER_GROUP", 10);
  let groupsPerFolder = envOrDefault("GROUPS_PER_FOLDER", 5);

  let input = {
    nuke: true, // Ensure we start from a clean slate.
    numAlerting,
    numRecording,
    rulesPerGroup,
    groupsPerFolder,
    grafanaURL: url,
    token: token,
    username: token ? '' : username,
    password: token ? '' : password,
    orgId: 1,
  };

  console.log("Generating test data with input:", input);
  let output = GenerateGroups(input);
  return { output, commonRequestParams, url };
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
  expect(allGroups.length).toBe(2);
}
