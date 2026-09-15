migrate((app) => {
  function saveProfile(data) {
    try { return app.findFirstRecordByData("agent_profiles", "external_id", data.external_id); } catch (_) {}
    const record = new Record(app.findCollectionByNameOrId("agent_profiles"));
    record.load(data); app.save(record); return record;
  }
  saveProfile({external_id:"profile-chat",name:"Interactive Analyst",role_type:"chat",model_provider:"gemini",model_name:"gemini-3.6-flash",system_prompt:"Answer the analyst using durable conversation and incident context.",tool_allowlist_json:[],max_runtime_sec:600,result_schema_version:"v1",enabled:true});
  for (const record of app.findRecordsByFilter("templates", "definition = null", "", 100)) {
    record.set("definition", {schema_version:1,name:record.getString("name"),role:"analysis",required_context:[],mcp_tool_policy:{},outputs:["markdown"],max_runtime_sec:record.getInt("max_runtime_sec") || 1800,instructions:"Execute this incident response playbook using the attached definition and incident evidence."});
    record.set("version", 1); app.save(record);
  }
}, (app) => {});
