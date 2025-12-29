import { GenerateGroups } from "k6/x/grafana-alerting";

export default function () {
  let output = GenerateGroups({
    alertRuleCount: 20,
    recordingRuleCount: 30,
    rulesPerGroup: 4,
    groupsPerFolder: 5,
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
