import { GenerateGroups } from "k6/x/grafana-alerting";

export function setup() {
  console.log("Setup function executed");
}

export default function () {
  let output = GenerateGroups({
    alertRuleCount: 20,
    recordingRuleCount: 30,
    queryDatasource: "__expr__",
    writeDatasource: "write_ds_id",
    rulesPerGroup: 4,
    groupsPerFolder: 5,
    uploadConfig: {
      grafanaURL: "http://localhost:3000",
      username: "admin",
      password: "admin",
      // token: "test-token",
      orgId: 1,
      folderUIDs: ["ef54fe11fnoqof", "df5xhzurq34lcd"],
    },
  });
  let groups = output.groups;
  let inputConfig = output.input_config;
  console.log(output);
  console.log(groups);
  console.log(groups.length);
  console.log(groups[0].title);
  console.log(groups[0].rules.length);
  console.log(groups[0].rules[0]);
  console.log(groups[0].rules[0].title);
  console.log(inputConfig);
}
