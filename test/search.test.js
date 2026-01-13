import { GenerateGroups } from "k6/x/grafana-alerting";
import http from "k6/http";
import { expect } from "https://jslib.k6.io/k6-testing/0.6.1/index.js";
import { envOrDefault, ensureConfig, buildRequestParams } from "./config.js";

export const options = {
  // This could take a while depending on the load.
  setupTimeout: "10m",
  teardownTimeout: "10m",
  thresholds: {
    "http_req_duration{page_loaded:1}": ["p(99)<3000"], // 99% of requests must complete below 3s.
    "http_req_failed{page_loaded:1}": ["rate<0.01"], // Less than 1% failed requests.
  },

  scenarios: {
    no_filters: {
      exec: "noFilters",
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 10,
      maxVUs: 100, // If the preAllocatedVUs are not enough, we can initialize more
      stages: [
        { target: 1, duration: "30s" }, // Start with 1 iteration per second for 30s
        { target: 3, duration: "30s" }, // Ramp up linearly (over 30s) to 3 iterations per second
        { target: 3, duration: "1m30s" }, // Maintain 3 iterations per second over the next minute and a half
        { target: 1, duration: "30s" }, // Ramp down to 1 iteration per second
      ],
    },
    two_filters: {
      exec: "twoFilters",
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      startTime: "3m", // Start after previous test
      preAllocatedVUs: 10,
      maxVUs: 100,
      stages: [
        { target: 1, duration: "30s" }, // Start with 1 iteration per second for 30s
        { target: 3, duration: "30s" }, // Ramp up linearly (over 30s) to 3 iterations per second
        { target: 3, duration: "1m30s" }, // Maintain 3 iterations per second over the next minute and a half
        { target: 1, duration: "30s" }, // Ramp down to 1 iteration per second
      ],
    },
    four_filters: {
      exec: "fourFilters",
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      startTime: "6m", // Start after previous test
      preAllocatedVUs: 10,
      maxVUs: 100,
      stages: [
        { target: 1, duration: "30s" }, // Start with 1 iteration per second for 30s
        { target: 3, duration: "30s" }, // Ramp up linearly (over 30s) to 3 iterations per second
        { target: 3, duration: "1m30s" }, // Maintain 3 iterations per second over the next minute and a half
        { target: 1, duration: "30s" }, // Ramp down to 1 iteration per second
      ],
    },
    all_filters: {
      exec: "allFilters",
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      startTime: "9m", // Start after previous test
      preAllocatedVUs: 10,
      maxVUs: 100,
      stages: [
        { target: 1, duration: "30s" }, // Start with 1 iteration per second for 30s
        { target: 3, duration: "30s" }, // Ramp up linearly (over 30s) to 3 iterations per second
        { target: 3, duration: "1m30s" }, // Maintain 3 iterations per second over the next minute and a half
        { target: 1, duration: "30s" }, // Ramp down to 1 iteration per second
      ],
    },
  },
};

export function setup() {
  const { url, token, username, password } = ensureConfig();
  const commonRequestParams = buildRequestParams(username, password, token);
  const numAlerting = envOrDefault("ALERT_RULE_COUNT", 100);
  const numRecording = envOrDefault("RECORDING_RULE_COUNT", 100);
  const rulesPerGroup = envOrDefault("RULES_PER_GROUP", 10);
  const totalGroups = (numAlerting + numRecording) / rulesPerGroup;
  const skipSetup = envOrDefault("SKIP_SETUP", false);
  if (skipSetup) {
    console.log("Skipping setup");
    return { commonRequestParams, url, totalGroups };
  }
  const groupsPerFolder = envOrDefault("GROUPS_PER_FOLDER", 5);

  let input = {
    nuke: true, // Delete all auto-gen folders before starting
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

  return { commonRequestParams, url, totalGroups };
}

export function noFilters({ commonRequestParams, url, totalGroups }) {
  const groups = search(url, {}, 40, commonRequestParams); // Empty filters

  // Check that we get the expected group count.
  expect(groups.length).toBe(Math.min(totalGroups, 40));
}

export function twoFilters({ commonRequestParams, url }) {
  const filters = {
    datasource_uid: "grafanacloud-prom",
    "search.rule_name": "A", // Any rules containing an "A" in its name
  };

  const groups = search(url, filters, 40, commonRequestParams);

  // Check that all rules in all groups are querying the expected data source.
  for (const group of groups) {
    for (const rule of group.rules) {
      expect(rule.queriedDatasourceUIDs).toContain(filters.datasource_uid);
    }
  }
}

export function fourFilters({ commonRequestParams, url }) {
  const filters = {
    datasource_uid: "grafanacloud-prom",
    receiver_name: "", // TODO: Generate data with simplified routing
    "search.folder": "Alerts Folder", // Will match all rules generated by alerting-gen
    "search.rule_name": "A", // Any rules containing an "A" in its name
  };

  search(url, filters, 40, commonRequestParams);
}

export function allFilters({ commonRequestParams, url }) {
  const filters = {
    datasource_uid: "grafanacloud-prom",
    health: "ok",
    plugins: "hide",
    receiver_name: "", // TODO: Generate data with simplified routing
    rule_matcher: `{"name":"env","value":"a.*","isRegex":true,"isEqual":true}`, // Will match labels env=~a.*
    rule_type: "alerting", // Filter out recording rules
    "search.folder": "Alerts Folder",
    "search.rule_group": "group", // Will match all rules generated by alerting-gen
    "search.rule_name": "A", // Any rules containing an "A" in its name
    state: "normal",
  };

  search(url, filters, 40, commonRequestParams);
}

// search sends a request to the /rules endpoint with the given filters and limit.
// It checks that at least one rule is returned and the limit is being applied.
function search(url, filters, groupLimit, commonRequestParams) {
  const prometheusResponse = http.get(buildRulesURL(url, filters, groupLimit), {
    tags: {
      page_loaded: "1",
    },
    ...commonRequestParams,
  });
  const prometheusData = JSON.parse(prometheusResponse.body);
  const groups = prometheusData.data.groups;

  expect(groups.length).toBeGreaterThan(0);
  expect(groups.length).toBeLessThanOrEqual(groupLimit);

  return groups;
}

// buildRulesURL validates the filters and uses them (and the group limit) to build the URL.
// Filters must already be URL-encoded.
function buildRulesURL(baseURL, filters, groupLimit) {
  if (!filters || filters.length == 0) {
    return `${baseURL}/api/prometheus/grafana/api/v1/rules?group_limit=${groupLimit}`;
  }

  const possibleFilters = [
    "datasource_uid",
    "search.rule_name",
    "search.rule_group",
    "search.folder",
    "plugins",
    "receiver_name",
    "rule_matcher",
    "rule_type",
    "state",
    "health",
  ];

  let filterArr = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!possibleFilters.includes(key)) {
      throw Error(`filter ${key} does not exist`);
    }
    filterArr.push(`${key}=${encodeURI(value)}`);
  }

  return `${baseURL}/api/prometheus/grafana/api/v1/rules?group_limit=40&${filterArr.join("&")}`;
}

export function teardown() {
  if (envOrDefault("SKIP_TEARDOWN", false)) {
    console.log("Skipping teardown");
    return;
  }

  const { url, token, username, password } = ensureConfig();
  console.log("Tearing down test data in Grafana");
  GenerateGroups({
    nuke: true, // Delete all auto-gen data
    grafanaURL: url,
    token: token,
    username: token ? "" : username,
    password: token ? "" : password,
  });
}
