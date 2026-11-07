// AFTERWORDS_REMOTE_MODULE_V1
module.exports.run = async function () {
  const URL = "https://raw.githubusercontent.com/Liifert/afterwords-dictionary/main/words.json";
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(),"afterwords-vocab-cache.json");
  const validate = x => Array.isArray(x) ? x.filter(w => w && typeof w.word === "string" && w.word.trim()).map(w => ({word:w.word.trim(),ipa:String(w.ipa||""),meaning:String(w.meaning||""),film:String(w.film||""),addedAt:String(w.addedAt||"")})) : [];
  let words=[];
  let syncSource="сохранённая копия";
  let syncError="";
  try { if(fm.fileExists(path)) words=validate(JSON.parse(fm.readString(path)).words); } catch(e){}
  // Fetch directly from GitHub Contents API to avoid stale raw-CDN responses.
  // Then use raw.githubusercontent as a fallback if API is unavailable.
  const apiURL = "https://api.github.com/repos/Liifert/afterwords-dictionary/contents/words.json?ref=main";
  let attempts=[];
  const sources=config.runsInWidget
    ? [{name:"GitHub RAW",url:URL+"?ts="+Date.now(),api:false}]
    : [{name:"GitHub API",url:apiURL+"&ts="+Date.now(),api:true},
       {name:"GitHub RAW",url:URL+"?ts="+Date.now(),api:false}];
  for(const source of sources) {
    try {
      const req=new Request(source.url);
      req.timeoutInterval=config.runsInWidget?5:18;
      req.headers={"Cache-Control":"no-cache","Accept":source.api?"application/vnd.github+json":"application/json"};
      const response=await req.loadJSON();
      let data=response;
      if(source.api) {
        if(!response.content) throw new Error("GitHub API did not return file content");
        const decoded=Data.fromBase64String(response.content.replace(/\s/g,""));
        if(!decoded) throw new Error("Cannot decode GitHub response");
        data=JSON.parse(decoded.toRawString());
      }
      const fresh=validate(Array.isArray(data)?data:data.words);
      if(!fresh.length) throw new Error("Empty vocabulary");
      // Never overwrite a newer local snapshot with a stale cached response.
      // A deletion will be reflected once the newer GitHub copy has propagated.
      if(fresh.length>=words.length) {
        words=fresh;
        syncSource=source.name+" · "+fresh.length+" слов";
        fm.writeString(path,JSON.stringify({words:fresh}));
      } else {
        attempts.push(source.name+": старая версия ("+fresh.length+" слов)");
      }
      if(syncSource.indexOf(source.name)===0) break;
    } catch(e) {
      attempts.push(source.name+": "+e);
    }
  }
  if(syncSource==="сохранённая копия") {
    syncError=attempts.join("; ");
    console.warn("AFTERWORDS sync issue: "+syncError);
  }
  if(!words.length) words=[{word:"snuggle",ipa:"/ˈsnʌɡəl/",meaning:"прижиматься, обниматься",film:"The Proposal",addedAt:""}];
  const now = new Date();
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  function weight(w) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(w.addedAt)) return 1;
    const d=new Date(w.addedAt+"T00:00:00");
    if(!Number.isFinite(d.getTime())) return 1;
    const age=Math.max(0,Math.floor((today-d)/86400000));
    return age<3?5:age<7?3:age<14?2:1;
  }
  // Smooth weighted round-robin: newest terms recur more frequently.
  const weights=words.map(weight), total=weights.reduce((a,b)=>a+b,0);
  const scores=weights.map(()=>0), cycle=[];
  for(let j=0;j<total;j++) {
    let best=0;
    for(let k=0;k<words.length;k++) {
      scores[k]+=weights[k];
      if(scores[k]>scores[best]) best=k;
    }
    scores[best]-=total;
    cycle.push(words[best]);
  }
  const slot=Math.floor(now.getTime()/1800000);
  const chosen=cycle[((slot%cycle.length)+cycle.length)%cycle.length];
  const w=new ListWidget();
  w.refreshAfterDate = new Date((slot+1)*1800000+2000);
  w.url=URLScheme.forRunningScript();
  function line(txt,size,bold,color,count) {
    const t=w.addText(txt||" ");
    t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);
    if(color)t.textColor=new Color(color);
    t.lineLimit=count||1; t.minimumScaleFactor=.6;
    return t;
  }
  if(config.widgetFamily==="accessoryRectangular"){
    w.addAccessoryWidgetBackground=true;
    w.setPadding(0,2,0,2);
    line(chosen.word,chosen.word.length>17?12:15,true);
    line(chosen.ipa,10,false);
    line(chosen.meaning,9,false);
  }else if(config.widgetFamily==="accessoryInline"){
    line(chosen.word+" "+chosen.ipa,11,false);
  }else if(config.widgetFamily==="accessoryCircular"){
    line(chosen.word,10,true).centerAlignText();
  }else {
    w.backgroundColor=new Color("#24211E");
    w.setPadding(16,15,14,15);
    line("afterwords.",12,true,"#D6C3AC");
    w.addSpacer();
    line(chosen.word,chosen.word.length>16?23:29,true,"#FFFFFF",2);
    w.addSpacer(4);
    line(chosen.ipa,14,false,"#D4C5B6",2);
    w.addSpacer(7);
    line(chosen.meaning,12,false,"#F2EBE3",3);
    w.addSpacer();
    line(chosen.film||"English vocabulary",10,false,"#A49B90");
  }
  Script.setWidget(w);
  console.log("AFTERWORDS: "+words.length+" words, slot "+slot+", currently "+chosen.word);
  if(!config.runsInWidget){
    const table=new UITable();table.showSeparators=true;
    const header=new UITableRow();header.isHeader=true;header.height=50;
    header.addText("AFTERWORDS · "+words.length+" слов",syncSource+" · проверено "+new Date().toLocaleTimeString()+(syncError?" · "+syncError:""));
    table.addRow(header);
    for(const item of words) {
      const row=new UITableRow();row.height=70;
      row.addText(item.word+"   "+item.ipa,item.meaning+(item.film?" · "+item.film:""));
      table.addRow(row);
    }
    await table.present();
  }
  Script.complete();
};