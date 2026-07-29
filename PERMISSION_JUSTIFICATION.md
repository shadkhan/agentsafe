# Permission Justification

- `activeTab`: lets AgentSafe scan only the current page after explicit user action.
- `sidePanel`: displays results and settings in Chrome's side panel.
- `storage`: stores local settings only.
- `scripting`: supports page inspection/highlighting in the active tab.
- `tabs`: reads the active tab URL/title so AgentSafe can request per-site optional access when Chrome expires `activeTab` while the side panel remains open.

Markdown and JSON reports download through an anchor element in the extension page, so AgentSafe does not request the `downloads` permission.

AgentSafe requests no host permissions and uses no background network access.

Optional host access:

- `http://*/*` and `https://*/*` are optional only. They are requested per site from the Scan action if Chrome denies active-tab script access, such as when the side panel remains open while the user changes tabs.
