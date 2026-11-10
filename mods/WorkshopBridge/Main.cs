using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityModManagerNet;
using HarmonyLib;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using BroMakerLib.Storages;

namespace BroforceWorkshop {
 public static class Main {
  internal static UnityModManager.ModEntry Mod;
  internal static string Ipc;
  static string session=Guid.NewGuid().ToString("N");
  static float poll;
  internal static DateTime driveUntil = DateTime.MinValue;
  internal static bool driveRight, driveLeft, driveFire, driveJump;
  static readonly HashSet<int> initialPlayers = new HashSet<int>();
  static readonly List<object> spawnEvents = new List<object>();
  internal static bool enabled = true;
  static string initialBro = "Bronobi";
  static JObject policies = new JObject();
  internal static readonly BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
  public static bool Load(UnityModManager.ModEntry entry) {
   Mod = entry;
   Ipc = Path.GetFullPath(Path.Combine(entry.Path, "../../../ipc"));
   Directory.CreateDirectory(Path.Combine(Ipc,"requests")); Directory.CreateDirectory(Path.Combine(Ipc,"responses"));
   entry.OnUpdate = Tick;
   entry.OnToggle = (m,v) => { enabled=v; return true; };
   new Harmony("BroforceWorkshop").PatchAll(Assembly.GetExecutingAssembly());
   File.WriteAllText(Path.Combine(Ipc,"ready.json"),JsonConvert.SerializeObject(new { ipc=Ipc, session=session, pid=System.Diagnostics.Process.GetCurrentProcess().Id, utc=DateTime.UtcNow.ToString("o") }));
   Log("ready", new { ipc=Ipc, session=session });
   return true;
  }
  internal static void Log(string kind, object data) {
   string line = JsonConvert.SerializeObject(new { utc=DateTime.UtcNow.ToString("o"), kind=kind, data=data });
   File.AppendAllText(Path.Combine(Ipc,"events.jsonl"),line+"\n");
   Mod.Logger.Log(line);
  }
  static void Tick(UnityModManager.ModEntry entry, float dt) {
   poll += dt; if(poll<0.1f) return; poll=0;
   foreach(string path in Directory.GetFiles(Path.Combine(Ipc,"requests"),"*.json").OrderBy(p=>p).Take(4)) {
    JObject req=null; object result=null; string error=null;
    try {
     req=JObject.Parse(File.ReadAllText(path));
     if((string)req["session"]!=session) throw new InvalidOperationException("Request belongs to an earlier game session");
     if(req["expiresUtc"]!=null && DateTime.UtcNow>DateTime.Parse((string)req["expiresUtc"]).ToUniversalTime()) throw new TimeoutException("Request expired before execution");
     result=Execute(req);
    }
    catch(Exception ex) { error=ex.ToString(); Log("command_error",new { path=path,error=error }); }
    string id=req==null?Path.GetFileNameWithoutExtension(path):(string)req["id"];
    if(id==null || Path.GetFileName(id)!=id) id=Path.GetFileNameWithoutExtension(path);
    string reply=Path.Combine(Path.Combine(Ipc,"responses"),id+".json");
    File.WriteAllText(reply+".tmp",JsonConvert.SerializeObject(new { id=id, ok=error==null, result=result, error=error },Formatting.Indented));
    if(File.Exists(reply)) File.Delete(reply); File.Move(reply+".tmp",reply); File.Delete(path);
   }
  }
  static object Execute(JObject req) {
   string op=(string)req["op"];
   if(op=="status") return Status();
   if(op=="switch_bro") {
    StoredHero chosen; string name=(string)req["name"];
    if(!BroMakerStorage.GetStoredHeroByName(name,out chosen)) throw new InvalidOperationException("Bro is not loaded: "+name+". Restart the Workshop profile after installing a new DLL.");
    chosen.LoadBro(0); return Status();
   }
   if(op=="hide_ui") { UnityModManager.UI.Instance.ToggleWindow(false); return new { hidden=true }; }
   if(op=="quit") { Application.Quit(); return new { quitting=true }; }
   if(op=="join") { typeof(JoinScreen).GetMethod("EditorTestJoin",Flags).Invoke(null,null); return new { joining=true }; }
   if(op=="start") { var join=UnityEngine.Object.FindObjectOfType<JoinScreen>(); if(join==null) throw new InvalidOperationException("Join screen is not ready"); typeof(JoinScreen).GetMethod("StartGame",Flags).Invoke(join,null); return new { starting=true }; }
   if(op=="drive") {
    int ms=(int?)req["milliseconds"]??500; if(ms<1 || ms>10000) throw new ArgumentException("duration must be 1..10000 milliseconds");
    driveRight=(bool?)req["right"]??false; driveLeft=(bool?)req["left"]??false; driveFire=(bool?)req["fire"]??false; driveJump=(bool?)req["jump"]??false;
    driveUntil=DateTime.UtcNow.AddMilliseconds(ms); return new { driving=true, milliseconds=ms };
   }
   if(op=="load_editor") {
    string name=Path.GetFileNameWithoutExtension((string)req["name"]);
    if(string.IsNullOrEmpty(name)) throw new ArgumentException("name required");
    initialPlayers.Clear();
    object editor=typeof(LevelEditorGUI).GetProperty("instance",Flags).GetValue(null,null);
    if(editor!=null) {
     typeof(LevelEditorGUI).GetField("fileName",Flags).SetValue(editor,name);
     typeof(LevelEditorGUI).GetMethod("LoadCampaign",Flags).Invoke(editor,null);
    } else {
     PlayerOptions.Instance.LastCustomLevel=name;
     object menu=typeof(MainMenu).GetField("instance",Flags).GetValue(null);
     if(menu==null) throw new InvalidOperationException("Main menu is not ready");
     typeof(MainMenu).GetMethod("LevelEditor",Flags).Invoke(menu,null);
    }
    return new { requested=name };
   }
   if(op=="play") {
    object editor=typeof(LevelEditorGUI).GetProperty("instance",Flags).GetValue(null,null);
    if(editor==null) throw new InvalidOperationException("Editor is not loaded");
    UnityModManager.UI.Instance.ToggleWindow(false);
    typeof(LevelEditorGUI).GetMethod("TogglePlayMode",Flags).Invoke(editor,null);
    return new { requested="toggle_play" };
   }
   if(op=="load_campaign") {
    UnityModManager.UI.Instance.ToggleWindow(false);
    string name=Path.GetFileNameWithoutExtension((string)req["name"]);
    LevelSelectionController.ResetLevelAndGameModeToDefault();
    GameModeController.publishRun=false;
    GameModeController.GameMode=GameMode.Campaign;
    LevelSelectionController.campaignToLoad=name;
    LevelSelectionController.loadCustomCampaign=true;
    LevelSelectionController.loadPublishedCampaign=true;
    LevelSelectionController.CurrentLevelNum=0;
    GameState.Instance.loadMode=(MapLoadMode)0;
    typeof(StatisticsController).GetMethod("ResetScore",Flags).Invoke(null,null);
    LevelEditorGUI.levelEditorActive=false;
    LevelSelectionController.currentCampaign=FileIO.LoadPublishedCampaignFromDisk(name,".bfg");
    typeof(GameState).Assembly.GetType("Utility.SceneLoader").GetMethod("LoadScene",Flags,null,new Type[]{typeof(string),typeof(LoadSceneMode)},null).Invoke(null,new object[]{LevelSelectionController.JoinScene,LoadSceneMode.Single});
    return new { requested=name };
   }
   if(op=="native_roundtrip") {
    string input=Path.GetFullPath((string)req["input"]);
    string output=Path.GetFullPath((string)req["output"]);
    if(!output.EndsWith(".bfg",StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("output must be bfg");
    Campaign campaign=FileIO.LoadCampaignBytes(File.ReadAllBytes(input),false,true);
    campaign.header.name=(string)req["name"]??campaign.name;
    campaign.header.author=(string)req["author"]??"Broforce Workshop";
    campaign.header.description="A short descent from the high ground into Hell.";
    campaign.header.length=campaign.levels.Length; campaign.header.isPublished=true;
    byte[] bytes=(byte[])typeof(FileIO).GetMethod("SerializeCampaign",Flags).Invoke(null,new object[]{campaign,true,true});
    File.WriteAllBytes(output,bytes);
    return new { levels=campaign.levels.Length, bytes=bytes.Length, output=output };
   }
   throw new ArgumentException("Unknown command: "+op);
  }
  static object Status() {
   var players=new List<object>();
   if(HeroController.players!=null) foreach(Player p in HeroController.players) {
    if(p==null) continue;
    var c=p.character;
    players.Add(new { player=p.playerNum, character=c==null?null:c.GetType().FullName, hero=c==null?null:c.heroType.ToString(), x=c==null?0:c.X, y=c==null?0:c.Y });
   }
   StoredHero bronobi;
   bool loaded=BroMakerStorage.GetStoredHeroByName("Bronobi",out bronobi);
   var cages=UnityEngine.Object.FindObjectsOfType<Cage>().Select(c=>new { x=c.transform.position.x,y=c.transform.position.y,colliders=c.GetComponentsInChildren<Collider>().Select(col=>new { name=col.name,bottom=col.bounds.min.y,top=col.bounds.max.y }).ToArray() }).ToArray();
   return new { scene=SceneManager.GetActiveScene().name, timeScale=Time.timeScale, editing=Map.isEditing, bronobiLoaded=loaded,cages=cages,
    map=Map.MapData==null?null:Map.MapData.levelDescription, players=players, spawns=spawnEvents.ToArray() };
  }
  internal static void EnsureEditorInitial() {
   if(!IsTarget() || HeroController.players==null || HeroController.players[0]==null) return;
   initialPlayers.Clear(); initialPlayers.Add(0); StoredHero first;
   if(string.IsNullOrEmpty(initialBro)) return;
   if(!BroMakerStorage.GetStoredHeroByName(initialBro,out first)) throw new InvalidOperationException(initialBro+" not loaded");
   first.LoadBro(0); Spawned(HeroController.players[0]);
  }
  internal static void ResetMap() {
   initialPlayers.Clear();
   string file=Path.GetFullPath(Path.Combine(Ipc,"../campaign-policies.json"));
   try { policies=File.Exists(file)?JObject.Parse(File.ReadAllText(file)):new JObject(); }
   catch(Exception ex) { policies=new JObject(); Log("policy_error",new { error=ex.Message }); }
   Log("map_awake",new { scene=SceneManager.GetActiveScene().name });
  }
  internal static bool IsTarget() {
   if(!enabled || Map.isEditing || Map.MapData==null || Map.MapData.levelDescription==null) return false;
   string description=Map.MapData.levelDescription;
   foreach(var policy in policies.Properties()) if(description.StartsWith(policy.Name,StringComparison.Ordinal)) {
    initialBro=(string)policy.Value["initialBro"];
    return true;
   }
   initialBro="Bronobi";
   return description.StartsWith("THE HIGH GROUND",StringComparison.Ordinal);
  }
  internal static bool Prepare(Player player) {
   var settings=BroMakerLib.Settings.instance;
   bool old=settings.disableSpawning;
   settings.disableSpawning=true;
   bool first=initialPlayers.Add(player.playerNum);
   if(first && !string.IsNullOrEmpty(initialBro)) {
    StoredHero bro;
    if(!BroMakerStorage.GetStoredHeroByName(initialBro,out bro)) throw new InvalidOperationException(initialBro+" was not loaded");
    settings.nextBroSpawn=initialBro;
    settings.overrideNextBroSpawn=true;
   } else {
    settings.overrideNextBroSpawn=false;
   }
   Log("spawn_policy",new { player=player.playerNum, initial=first, requested=first && !string.IsNullOrEmpty(initialBro)?initialBro:"vanilla random" });
   return old;
  }
  internal static void Spawned(Player player) {
   var c=player.character;
   object evt=new { utc=DateTime.UtcNow.ToString("o"), player=player.playerNum, character=c==null?null:c.GetType().FullName, hero=c==null?null:c.heroType.ToString() };
   spawnEvents.Add(evt); Log("spawn_result",evt);
  }
 }
 [HarmonyPatch(typeof(LevelEditorGUI),"TogglePlayMode")]
 static class EditorPlayPatch {
  static void Prefix(out bool __state) { __state=Map.isEditing; }
  static void Postfix(bool __state) { if(__state) Main.EnsureEditorInitial(); }
 }
 [HarmonyPatch(typeof(Map),"Awake")]
 static class MapAwakePatch { static void Postfix() { Main.ResetMap(); } }
 [HarmonyPatch(typeof(Player),"SpawnHero")]
 static class SpawnPatch {
  [HarmonyPriority(Priority.First),HarmonyBefore("BroMakerLib")]
  static void Prefix(Player __instance, out bool[] __state) {
   __state=null;
   if(!Main.IsTarget()) return;
   bool old=Main.Prepare(__instance);
   __state=new bool[]{old};
  }
  [HarmonyPriority(Priority.Last),HarmonyAfter("BroMakerLib")]
  static void Postfix(Player __instance, bool[] __state) {
   if(__state==null) return;
   BroMakerLib.Settings.instance.disableSpawning=__state[0]; Main.Spawned(__instance);
  }
 }
}

namespace BroforceWorkshop {
 [HarmonyPatch(typeof(Player),"GetInput")]
 static class InputPatch {
  static void Postfix(Player __instance, ref bool up, ref bool down, ref bool left, ref bool right, ref bool fire, ref bool buttonJump, ref bool special, ref bool highFive, ref bool buttonGesture, ref bool sprint) {
   if(__instance.playerNum!=0 || DateTime.UtcNow>=Main.driveUntil) return;
   up=false; down=false; left=Main.driveLeft; right=Main.driveRight; fire=Main.driveFire; buttonJump=Main.driveJump; special=false; highFive=false; buttonGesture=false; sprint=false;
  }
 }
}
