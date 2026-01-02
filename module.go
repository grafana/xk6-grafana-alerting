// Package grafana-alerting contains the xk6-grafana-alerting extension.
package grafana_alerting

import (
	"encoding/json"

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

// FIXME: make this export with proper camel case instead of snake case from reflection
type GenerateGroupsOutput struct {
	Groups      []*models.AlertRuleGroup `json:"groups"`
	InputConfig execute.Config           `json:"inputConfig"`
}

func (m *module) generateGroups(rawConfig sobek.Value) *sobek.Object {
	if rawConfig == nil {
		panic("generateGroups requires a configuration object")
	}

	runtime := m.vu.Runtime()
	var config execute.Config
	b, err := rawConfig.ToObject(runtime).MarshalJSON()
	if err != nil {
		panic(err)
	}

	if err := json.Unmarshal(b, &config); err != nil {
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
