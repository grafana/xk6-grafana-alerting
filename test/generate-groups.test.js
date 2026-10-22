import { check, fail } from "k6";
import { GenerateGroups } from "k6/x/grafana-alerting";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"],
  },
};

const config = {
  dryRun: true,
  numAlerting: 3,
  numRecording: 2,
  rulesPerGroup: 2,
  groupsPerFolder: 3,
  folderUIDsCSV: "smoke-folder",
  queryDS: "smoke-query",
  writeDS: "smoke-write",
  evalInterval: 60,
  seed: 42,
};

function assert(condition, message) {
  if (!check(condition, { [message]: (value) => value })) {
    fail(message);
  }
}

function verifyGroups(output) {
  const totalRules = config.numAlerting + config.numRecording;
  const expectedGroups = Math.ceil(totalRules / config.rulesPerGroup);
  assert(Array.isArray(output.groups), "groups is an array");
  assert(output.groups.length === expectedGroups, "group count matches input");

  const rules = [];
  for (const [index, group] of output.groups.entries()) {
    const expectedRules = Math.min(
      config.rulesPerGroup,
      totalRules - index * config.rulesPerGroup,
    );
    assert(Array.isArray(group.rules), "group rules is an array");
    assert(group.rules.length === expectedRules, "group size matches input");
    assert(
      typeof group.title === "string" && group.title.length > 0,
      "group has a title",
    );
    assert(
      group.folder_uid === config.folderUIDsCSV,
      "group belongs to requested folder",
    );
    assert(
      group.interval === config.evalInterval,
      "group uses requested evaluation interval",
    );

    for (const rule of group.rules) {
      assert(
        rule.title != null && String(rule.title).length > 0,
        "rule has a title",
      );
      assert(
        typeof rule.uid === "string" && rule.uid.length > 0,
        "rule has a uid",
      );
      assert(String(rule.rule_group) === group.title, "rule belongs to its group");
      assert(
        String(rule.folder_uid) === group.folder_uid,
        "rule belongs to its folder",
      );
      assert(
        Array.isArray(rule.data) && rule.data.length > 0,
        "rule has query data",
      );
      rules.push(rule);
    }
  }

  assert(rules.length === totalRules, "total rule count matches input");
  assert(
    rules.filter((rule) => !rule.record).length === config.numAlerting,
    "alerting rule count matches input",
  );
  assert(
    rules.filter((rule) => rule.record).length === config.numRecording,
    "recording rule count matches input",
  );
  assert(
    output.input_config.num_alerting === config.numAlerting,
    "input config preserves alerting count",
  );
  assert(
    output.input_config.num_recording === config.numRecording,
    "input config preserves recording count",
  );
  assert(output.input_config.seed === config.seed, "input config preserves seed");
  assert(output.input_config.dry_run === true, "input config preserves dry run");
}

export default function () {
  let completed = false;
  try {
    const output = GenerateGroups(config);
    verifyGroups(output);
    const serialized = JSON.parse(JSON.stringify(output));
    verifyGroups(serialized);
    for (const group of serialized.groups) {
      for (const rule of group.rules) {
        assert(
          [rule.title, rule.rule_group, rule.folder_uid].every(
            (value) => typeof value === "string",
          ),
          "serialized pointer-backed fields are strings",
        );
      }
    }
    completed = true;
  } finally {
    // k6 can exit successfully after an iteration throws unless a threshold fails.
    check(completed, { "generation and serialization completed": (value) => value });
  }
}
