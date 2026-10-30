const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const source = process.argv[3] || path.join(root, 'node_modules/expo-audio/android/src/main/java/expo/modules/audio/service/TrackNavigationPlayer.kt');
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, artifact, version) {
  const dir = path.join(cache, group, artifact, version);
  for (const hash of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const folder = path.join(dir, hash);
    if (!fs.statSync(folder).isDirectory()) continue;
    const file = fs.readdirSync(folder).find(name => name.endsWith('.jar'));
    if (file) return path.join(folder, file);
  }
  throw new Error('Missing cached JVM test dependency: ' + artifact + '@' + version + '. Run the Android Gradle build first.');
}
const compiler = [
  jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
  jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
  jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
  jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
  jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
  jar('org.jetbrains', 'annotations', '13.0'),
  jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yeongdu-media-session-test-'));
const classes = path.join(temp, 'classes');
fs.mkdirSync(classes);
function write(name, content) {
  const file = path.join(temp, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
const java = [];
java.push(write('FlagSet.java', `package androidx.media3.common;
import java.util.*;
public class FlagSet {
 public final List<Integer> flags;
 FlagSet(Set<Integer> flags){this.flags=new ArrayList<>(flags);}
 public static class Builder {
  private final Set<Integer> flags=new LinkedHashSet<>();
  public Builder add(int flag){flags.add(flag);return this;}
  public FlagSet build(){return new FlagSet(flags);}
 }
}`));
java.push(write('Timeline.java', 'package androidx.media3.common; public class Timeline { private final boolean empty; public Timeline(boolean empty){this.empty=empty;} public boolean isEmpty(){return empty;} }'));
java.push(write('UnstableApi.java', 'package androidx.media3.common.util; public @interface UnstableApi {}'));

// Compile the real Java delegate against callbacks with Java default bodies.
// This reproduces the Kotlin delegation pitfall missed by event-only mocks.
const nativeDelegate = fs.readFileSync(path.join(root, 'node_modules/expo-audio/android/src/main/java/expo/modules/audio/service/ForwardingPlayerListener.java'), 'utf8');
const callbackMethods = [...nativeDelegate.matchAll(/@Override public void (\w+)\(([^)]*)\)/g)];
const defaultCallbacks = callbackMethods.map(([,name,args]) => 'default void ' + name + '(' + args + '){}').join(' ');
const typeNames = new Set([...nativeDelegate.matchAll(/androidx\.media3\.common(?:\.text)?\.[A-Z]\w*/g)].map(match => match[0]));
for (const typeName of typeNames) {
 if (['androidx.media3.common.Player', 'androidx.media3.common.Timeline'].includes(typeName)) continue;
 const split = typeName.lastIndexOf('.');
 java.push(write(typeName.replaceAll('.', '/') + '.java', 'package ' + typeName.slice(0, split) + '; public class ' + typeName.slice(split + 1) + '{}'));
}
java.push(write('ForwardingPlayerListener.java', nativeDelegate));

java.push(write('Player.java', `package androidx.media3.common;
import java.util.*;
public interface Player {
 int COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM=5, COMMAND_SEEK_TO_NEXT=9, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM=8, COMMAND_SEEK_TO_PREVIOUS=7, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM=6;
 int EVENT_AVAILABLE_COMMANDS_CHANGED=13, EVENT_TIMELINE_CHANGED=0;
 Commands getAvailableCommands(); boolean isCommandAvailable(int command);
 long getDuration(); boolean isPlayingAd(); Timeline getCurrentTimeline();
 void seekTo(long position); void seekToNext(); void seekToNextMediaItem(); void seekToPrevious(); void seekToPreviousMediaItem();
 void addListener(Listener listener); void removeListener(Listener listener);
 interface Listener { ${defaultCallbacks} }
 class PositionInfo {}
 class Commands {
  final Set<Integer> flags;
  Commands(Set<Integer> flags){this.flags=new LinkedHashSet<>(flags);}
  public boolean contains(int flag){return flags.contains(flag);}
  public Builder buildUpon(){return new Builder(flags);}
  public boolean equals(Object other){return other instanceof Commands && flags.equals(((Commands)other).flags);}
  public int hashCode(){return flags.hashCode();}
  public static class Builder {
   final Set<Integer> flags=new LinkedHashSet<>();
   public Builder(){} Builder(Set<Integer> flags){this.flags.addAll(flags);}
   public Builder add(int flag){flags.add(flag);return this;} public Builder remove(int flag){flags.remove(flag);return this;}
   public Commands build(){return new Commands(flags);}
  }
 }
 class Events {
  final FlagSet flags;
  public Events(FlagSet flags){this.flags=flags;}
  public int size(){return flags.flags.size();} public int get(int index){return flags.flags.get(index);}
  public boolean contains(int flag){return flags.flags.contains(flag);}
 }
}`));
java.push(write('ForwardingPlayer.java', `package androidx.media3.common;
public class ForwardingPlayer implements Player {
 private final Player player;
 public ForwardingPlayer(Player player){this.player=player;}
 public Commands getAvailableCommands(){return player.getAvailableCommands();}
 public boolean isCommandAvailable(int command){return player.isCommandAvailable(command);}
 public long getDuration(){return player.getDuration();} public boolean isPlayingAd(){return player.isPlayingAd();}
 public Timeline getCurrentTimeline(){return player.getCurrentTimeline();}
 public void seekTo(long position){player.seekTo(position);}
 public void seekToNext(){player.seekToNext();} public void seekToNextMediaItem(){player.seekToNextMediaItem();}
 public void seekToPrevious(){player.seekToPrevious();} public void seekToPreviousMediaItem(){player.seekToPreviousMediaItem();}
 public void addListener(Listener listener){player.addListener(listener);} public void removeListener(Listener listener){player.removeListener(listener);}
}`));
const stubs = write('AudioStubs.kt', `package expo.modules.audio
import androidx.media3.common.Player
class AudioPlayer(val ref: Player) {
 var isLive = false
 val navigation = mutableListOf<String>()
 fun requestTrackNavigation(direction: String) { navigation.add(direction) }
}
class AudioLockScreenOptions(val isLiveStream: Boolean? = null, val showSkipNext: Boolean = false, val showSkipPrevious: Boolean = false)
`);
const cases = write('Test.kt', `package expo.modules.audio.service
import androidx.media3.common.*
import expo.modules.audio.*

class FakePlayer : Player {
 var commands = Player.Commands.Builder().build()
 var durationMs = -1L
 var empty = true
 var ad = false
 var positionMs = 0L
 val listeners = mutableSetOf<Player.Listener>()
 override fun getAvailableCommands() = commands
 override fun isCommandAvailable(command: Int) = commands.contains(command)
 override fun getDuration() = durationMs
 override fun getCurrentTimeline() = Timeline(empty)
 override fun isPlayingAd() = ad
 override fun seekTo(position: Long) { positionMs = position }
 override fun seekToNext() {}
 override fun seekToNextMediaItem() {}
 override fun seekToPrevious() {}
 override fun seekToPreviousMediaItem() {}
 override fun addListener(listener: Player.Listener) { listeners.add(listener) }
 override fun removeListener(listener: Player.Listener) { listeners.remove(listener) }
 fun emit(vararg flags: Int) {
  if (flags.contains(Player.EVENT_TIMELINE_CHANGED)) listeners.toList().forEach { it.onTimelineChanged(currentTimeline, 1) }
  val builder = FlagSet.Builder()
  flags.forEach { builder.add(it) }
  listeners.toList().forEach { it.onEvents(this, Player.Events(builder.build())) }
 }
}
fun main() {
 val seek = Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM
 val player = FakePlayer()
 val audio = AudioPlayer(player)
 val wrapper = TrackNavigationPlayer(audio, AudioLockScreenOptions(false, true, true))
 var timelineCallbacks = 0
 var timelineReason = -1
 val reported = mutableListOf<Player.Commands>()
 val batches = mutableListOf<Player.Events>()
 val listener = object : Player.Listener {
  override fun onTimelineChanged(timeline: Timeline, reason: Int) { timelineCallbacks++; timelineReason = reason }
  override fun onAvailableCommandsChanged(commands: Player.Commands) { reported.add(commands) }
  override fun onEvents(source: Player, events: Player.Events) { check(source === wrapper); batches.add(events) }
 }
 wrapper.addListener(listener)
 check(!wrapper.isCommandAvailable(seek)) { "Loading/unknown duration must not advertise seeking" }
 player.empty = false; player.durationMs = 180000
 // Network duration arrives without an original command change.
 player.emit(Player.EVENT_TIMELINE_CHANGED)
 check(wrapper.isCommandAvailable(seek)) { "Finite NAS song must expose app-equivalent seek" }
 check(timelineCallbacks == 1 && timelineReason == 1) { "Timeline callback and original reason must reach MediaSession" }
 check(reported.last().contains(seek))
 check(batches.last().contains(Player.EVENT_TIMELINE_CHANGED))
 check(batches.last().contains(Player.EVENT_AVAILABLE_COMMANDS_CHANGED))
 wrapper.seekTo(42000); check(player.positionMs == 42000L)
 val count = reported.size
 player.emit(Player.EVENT_TIMELINE_CHANGED); check(reported.size == count)
 check(!batches.last().contains(Player.EVENT_AVAILABLE_COMMANDS_CHANGED))
 wrapper.seekToNext(); wrapper.seekToPrevious(); check(audio.navigation == listOf("next", "previous"))
 player.durationMs = 0; player.emit(Player.EVENT_TIMELINE_CHANGED)
 check(!wrapper.isCommandAvailable(seek)); check(!reported.last().contains(seek))
 player.durationMs = 180000; player.ad = true; player.emit(Player.EVENT_TIMELINE_CHANGED)
 check(!wrapper.isCommandAvailable(seek))
 player.ad = false; player.empty = true; player.emit(Player.EVENT_TIMELINE_CHANGED)
 check(!wrapper.isCommandAvailable(seek))
 player.empty = false; audio.isLive = true; player.emit(Player.EVENT_TIMELINE_CHANGED)
 check(!wrapper.isCommandAvailable(seek))
 audio.isLive = false
 val live = TrackNavigationPlayer(audio, AudioLockScreenOptions(true))
 check(!live.isCommandAvailable(seek))
 val automatic = TrackNavigationPlayer(audio, AudioLockScreenOptions())
 check(!automatic.isCommandAvailable(seek)) { "Unspecified source must retain native capability" }
 player.commands = Player.Commands.Builder().add(seek).build()
 check(automatic.isCommandAvailable(seek)) { "Native seekable/demo playback must remain supported" }
 wrapper.addListener(listener); check(player.listeners.size == 1)
 wrapper.removeListener(listener); check(player.listeners.isEmpty())
 println("PASS: native session adapter finite/late-duration seek, seek forwarding, loading/live/ad/unknown guards, command events, skip commands and listener cleanup (mock Media3).")
}
`);
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  if (result.stdout) process.stdout.write(result.stdout);
}

java.push(write('ListenerForwardingTest.java', `package expo.modules.audio.service;
import androidx.media3.common.Player;
import java.lang.reflect.*;
import java.util.*;
public class ListenerForwardingTest {
 public static void main(String[] args) throws Exception {
  final Method[] received = new Method[1]; final Object[][] values = new Object[1][];
  Player.Listener target = (Player.Listener)Proxy.newProxyInstance(Player.Listener.class.getClassLoader(),new Class[]{Player.Listener.class},(proxy, method, arguments)->{received[0]=method;values[0]=arguments;return null;});
  ForwardingPlayerListener forward = new ForwardingPlayerListener(target){};
  int count=0;
  for(Method method:Player.Listener.class.getDeclaredMethods()) {
   Object[] parameters=new Object[method.getParameterCount()];Class<?>[] types=method.getParameterTypes();
   for(int i=0;i<types.length;i++) parameters[i]=types[i]==int.class?Integer.valueOf(42):types[i]==long.class?Long.valueOf(12000):types[i]==float.class?Float.valueOf(0.5f):types[i]==boolean.class?Boolean.TRUE:null;
   received[0]=null;values[0]=null;method.invoke(forward,parameters);
   if(!method.equals(received[0])||!Arrays.equals(parameters,values[0]==null?new Object[0]:values[0])) throw new AssertionError("Callback dropped/changed: "+method.getName());
   count++;
  }
  if(count!=37)throw new AssertionError("Pinned Media3 1.9.0 callbacks: "+count);
  System.out.println("PASS: all 37 Java default Listener callbacks forward without loss, including timeline, seek, play/pause, errors and metadata (mock Media3).");
 }
}`));

run('javac', ['-d', classes, ...java]);
run('java', ['-cp', classes, 'expo.modules.audio.service.ListenerForwardingTest']);
run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classes + path.delimiter + compiler[1], '-d', classes, source, stubs, cases]);
run('java', ['-cp', classes + path.delimiter + compiler[1], 'expo.modules.audio.service.TestKt']);

// Run the actual bounded handoff-lock implementation with a virtual Android
// clock. This checks expiration and reference counting without keeping a device awake.
const wakeContext = write('WakeContext.kt', `package android.content
import android.os.PowerManager
class Context(val power: PowerManager) {
 companion object { const val POWER_SERVICE = "power" }
 fun getSystemService(name: String): Any { check(name == POWER_SERVICE); return power }
}`);
const wakePower = write('WakePower.kt', `package android.os
class PowerManager {
 companion object { const val PARTIAL_WAKE_LOCK = 1 }
 val lock = WakeLock()
 var flags = 0
 var tag = ""
 fun newWakeLock(flags: Int, tag: String): WakeLock { this.flags = flags; this.tag = tag; return lock }
 class WakeLock {
  var now = 0L
  var deadline = 0L
  var counted = true
  var releases = 0
  val isHeld: Boolean get() = now < deadline
  fun setReferenceCounted(value: Boolean) { counted = value }
  fun acquire(timeout: Long) { check(timeout > 0); deadline = now + timeout }
  fun release() { check(isHeld); releases++; deadline = now }
 }
}`);
const wakeCases = write('WakeTest.kt', `package expo.modules.audio
import android.content.Context
import android.os.PowerManager
fun main() {
 val power = PowerManager()
 val transition = TrackTransitionWakeLock(Context(power))
 check(power.flags == PowerManager.PARTIAL_WAKE_LOCK) { "Must not turn the display on" }
 check(!power.lock.isHeld && !power.lock.counted)
 transition.acquire(); check(power.lock.deadline == 30000L)
 power.lock.now = 1200L; transition.acquire(); check(power.lock.deadline == 31200L)
 transition.release(); check(!power.lock.isHeld && power.lock.releases == 1)
 transition.release(); check(power.lock.releases == 1)
 transition.acquire(); power.lock.now += 30001L
 check(!power.lock.isHeld) { "A missing JS response must not hold the CPU forever" }
 transition.release(); check(power.lock.releases == 1)
 transition.acquire(); check(power.lock.isHeld)
 transition.release(); check(power.lock.releases == 2)
 println("PASS: real native handoff-lock code uses display-off CPU mode, a 30-second deadline, no reference-count leak, early release and safe timeout/reuse (mock Android).")
}`);
const wakeSource = path.join(root, 'node_modules/expo-audio/android/src/main/java/expo/modules/audio/TrackTransitionWakeLock.kt');
run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', compiler[1], '-d', classes, wakeSource, wakeContext, wakePower, wakeCases]);
run('java', ['-cp', classes + path.delimiter + compiler[1], 'expo.modules.audio.WakeTestKt']);
const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'AppData/Local/Android/Sdk');
const platforms = path.join(sdk, 'platforms');
const androidJar = (fs.existsSync(platforms) ? fs.readdirSync(platforms).sort().reverse() : [])
  .map(version => path.join(platforms, version, 'android.jar')).find(file => fs.existsSync(file));
if (androidJar) {
  run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', compiler[1] + path.delimiter + androidJar, '-d', path.join(temp, 'android-api-classes'), wakeSource]);
  console.log('PASS: handoff-lock source compiles against the installed real Android SDK API (no mock Android types).');
}
console.log('Real Media3 compilation and Samsung/NAS behavior need separate validation. No NAS requests are made.');

