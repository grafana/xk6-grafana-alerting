// Package grafana-alerting contains the xk6-grafana-alerting extension.
package grafana_alerting

import (
	"fmt"
	"time"

	"github.com/grafana/grafana-openapi-client-go/models"
	"github.com/grafana/sobek"
	"go.k6.io/k6/js/modules"

	"github.com/grafana/alerting/testing/alerting-gen/pkg/execute"
)

type rootModule struct{}

func (*rootModule) NewModuleInstance(vu modules.VU) modules.Instance {
	return &module{vu}
}

type module struct {
	vu modules.VU
}

func (m *module) Exports() modules.Exports {
	return modules.Exports{
		Named: map[string]any{
			"GenerateGroups": m.generateGroups,
		},
	}
}

// TODO: how to parse in the incoming config options?
func parseConfig(rawConfig sobek.Value, runtime *sobek.Runtime) (execute.Config, error) {
	parsedConfig := execute.Config{}
	if rawConfig == nil || sobek.IsUndefined(rawConfig) {
		return parsedConfig, fmt.Errorf("generateGroups requires a configuration object")
	}
	converted := rawConfig.ToObject(runtime)
	if val := converted.Get("alertRuleCount"); val != nil && !sobek.IsUndefined(val) {
		parsedConfig.NumAlerting = int(val.ToInteger())
	}
	if val := converted.Get("recordingRuleCount"); val != nil && !sobek.IsUndefined(val) {
		parsedConfig.NumRecording = int(val.ToInteger())
	}
	if val := converted.Get("queryDatasource"); val != nil && !sobek.IsUndefined(val) {
		parsedConfig.QueryDS = val.String()
	}
	if val := converted.Get("writeDatasource"); val != nil && !sobek.IsUndefined(val) {

		parsedConfig.WriteDS = val.String()
	}
	if val := converted.Get("rulesPerGroup"); val != nil && !sobek.IsUndefined(val) {
		parsedConfig.RulesPerGroup = int(val.ToInteger())
	}
	if val := converted.Get("groupsPerFolder"); val != nil && !sobek.IsUndefined(val) {
		parsedConfig.GroupsPerFolder = int(val.ToInteger())
	}
	if val := converted.Get("seed"); val != nil && !sobek.IsUndefined(val) {
		parsedConfig.Seed = int64(val.ToInteger())
	} else {
		parsedConfig.Seed = time.Now().UnixNano()

	}
	if val := converted.Get("uploadConfig"); val != nil && !sobek.IsUndefined(val) {
		uploadConfigObj := val.ToObject(runtime)
		uploadConfig := execute.UploadOptions{}
		if urlVal := uploadConfigObj.Get("grafanaURL"); urlVal != nil && !sobek.IsUndefined(urlVal) {
			uploadConfig.GrafanaURL = urlVal.String()
		}
		if apiKeyVal := uploadConfigObj.Get("token"); apiKeyVal != nil && !sobek.IsUndefined(apiKeyVal) {
			uploadConfig.Token = apiKeyVal.String()
		}
		if userVal := uploadConfigObj.Get("username"); userVal != nil && !sobek.IsUndefined(userVal) {
			uploadConfig.Username = userVal.String()
		}
		if passVal := uploadConfigObj.Get("password"); passVal != nil && !sobek.IsUndefined(passVal) {
			uploadConfig.Password = passVal.String()
		}
		if orgIDVal := uploadConfigObj.Get("orgID"); orgIDVal != nil && !sobek.IsUndefined(orgIDVal) {
			uploadConfig.OrgID = orgIDVal.ToInteger()
		}
		if folderUIDsVal := uploadConfigObj.Get("folderUIDs"); folderUIDsVal != nil && !sobek.IsUndefined(folderUIDsVal) {
			// convert string array to CSV
			folderUIDsArray := folderUIDsVal.ToObject(runtime)
			var folderUIDsCSV string
			length := folderUIDsArray.Get("length").ToInteger()
			for i := int64(0); i < length; i++ {
				if i > 0 {
					folderUIDsCSV += ","
				}
				item := folderUIDsArray.Get(fmt.Sprintf("%d", i))
				folderUIDsCSV += item.String()
			}
			uploadConfig.FolderUIDsCSV = folderUIDsCSV
		}
		parsedConfig.UploadOptions = uploadConfig
	}
	return parsedConfig, nil
}

// FIXME: make this export with proper camel case via the json tags instead of snake case from reflection
type GenerateGroupsOutput struct {
	Groups      []*models.AlertRuleGroup `json:"groups"`
	InputConfig execute.Config           `json:"inputConfig"`
}

func (m *module) generateGroups(rawConfig sobek.Value) *sobek.Object {
	runtime := m.vu.Runtime()
	config, err := parseConfig(rawConfig, runtime)
	if err != nil {
		panic(err)
	}
	// What type do we return? The data is an array of rules which can be json encoded
	groups, err := execute.Run(config, true)
	if err != nil {
		panic(err)
	}
	result := &GenerateGroupsOutput{
		Groups:      groups,
		InputConfig: config,
	}
	returnVal := runtime.ToValue(result)
	return returnVal.ToObject(runtime)
}

var _ modules.Module = (*rootModule)(nil)
