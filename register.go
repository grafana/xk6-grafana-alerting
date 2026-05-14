package grafana_alerting

import "go.k6.io/k6/v2/js/modules"

const importPath = "k6/x/grafana-alerting"

func init() {
	modules.Register(importPath, new(rootModule))
}
