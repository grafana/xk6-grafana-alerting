import { GenerateGroups } from "k6/x/grafana-alerting";

// This should create a folder and upload rules using the default settings.
export default function () {
  let output = GenerateGroups({
    alertRuleCount: 1,

    uploadConfig: {
      grafanaURL: "http://localhost:3000",
      username: "admin",
      password: "admin",
      // token: "test-token",
      orgId: 1,
    },
  });

  console.log("Input config:", output.input_config);
  console.log("Groups:", output.groups);
}
