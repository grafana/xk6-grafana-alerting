import { GenerateGroups } from "k6/x/grafana-alerting";

// This should create a folder and upload rules using the default settings.
export default function () {
  let output = GenerateGroups({
    numAlerting: 1,
    numRecording: 5,
    groupsPerFolder: 5,
    rulesPerGroup: 5,
    grafanaURL: "http://localhost:3000",
    username: "admin",
    password: "admin",
    orgId: 1,
    nuke: true,
  });

  console.log("Input config:", output.input_config);
  console.log("Groups:", output.groups);
}
