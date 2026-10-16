package xyz.yeongdu.coverprobe;
import android.app.Instrumentation;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.os.Bundle;
import android.graphics.BitmapFactory;
import android.net.Uri;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
public class Probe extends Instrumentation {
 public void onCreate(Bundle args){super.onCreate(args);start();}
 public void onStart(){
  Bundle output=new Bundle();
  try{
   getUiAutomation().adoptShellPermissionIdentity("android.permission.MEDIA_CONTENT_CONTROL");
   MediaSessionManager manager=(MediaSessionManager)getTargetContext().getSystemService(android.content.Context.MEDIA_SESSION_SERVICE);
   String artwork=null;int sessions=0;android.media.session.MediaSession.Token platformToken=null;
   for(MediaController ctrl:manager.getActiveSessions(null)){
    if(!ctrl.getPackageName().equals("xyz.yeongdu.yeongdumusic"))continue;
    sessions++;platformToken=ctrl.getSessionToken();
    MediaMetadata metadata=ctrl.getMetadata();
    if(metadata==null)continue;
    for(String key:new String[]{MediaMetadata.METADATA_KEY_ART_URI,MediaMetadata.METADATA_KEY_ALBUM_ART_URI,MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI}){
     String candidate=metadata.getString(key);
     if(candidate!=null&&candidate.contains("SYNO.AudioStation.Cover")){artwork=candidate;break;}
    }
   }
   output.putInt("matchingSessions",sessions);
   if(artwork==null&&platformToken!=null){
    ClassLoader loader=new dalvik.system.DexClassLoader(getTargetContext().getPackageManager().getApplicationInfo("xyz.yeongdu.yeongdumusic",0).sourceDir,null,null,getTargetContext().getClassLoader());
    Class<?> tokenClass=loader.loadClass("androidx.media3.session.SessionToken");
    Object token=((java.util.concurrent.Future<?>)tokenClass.getMethod("createSessionToken",android.content.Context.class,android.media.session.MediaSession.Token.class,android.os.Looper.class).invoke(null,getTargetContext(),platformToken,android.os.Looper.getMainLooper())).get(5,java.util.concurrent.TimeUnit.SECONDS);
    Class<?> builderClass=loader.loadClass("androidx.media3.session.MediaController$Builder");final Object[] future=new Object[1];
    runOnMainSync(()->{try{Object builder=builderClass.getConstructor(android.content.Context.class,tokenClass).newInstance(getTargetContext(),token);future[0]=builderClass.getMethod("buildAsync").invoke(builder);}catch(Exception e){output.putString("buildFailure",e.getClass().getSimpleName());}});
    if(future[0]!=null){
     Object controller=((java.util.concurrent.Future<?>)future[0]).get(5,java.util.concurrent.TimeUnit.SECONDS);Class<?> controllerClass=loader.loadClass("androidx.media3.session.MediaController");final String[] found=new String[1];
     runOnMainSync(()->{try{Object metadata=controllerClass.getMethod("getMediaMetadata").invoke(controller);Object uri=metadata.getClass().getField("artworkUri").get(metadata);if(uri!=null)found[0]=uri.toString();controllerClass.getMethod("release").invoke(controller);}catch(Exception e){output.putString("readFailure",e.getClass().getSimpleName());}});
     if(found[0]!=null){Uri foundUri=Uri.parse(found[0]);output.putString("artworkScheme",foundUri.getScheme());if("https".equals(foundUri.getScheme())){output.putString("artworkApi",foundUri.getQueryParameter("api"));output.putString("artworkMethod",foundUri.getQueryParameter("method"));}if(found[0].contains("SYNO.AudioStation.Cover"))artwork=found[0];}
    }
   }
   output.putBoolean("nasArtworkAvailable",artwork!=null);
   if(artwork!=null){
    Uri parsed=Uri.parse(artwork);
    for(String size:new String[]{"320","600","1024","original","omitted"}){
     Uri.Builder builder=parsed.buildUpon().clearQuery();
     for(String key:parsed.getQueryParameterNames())if(!key.equals("size"))for(String value:parsed.getQueryParameters(key))builder.appendQueryParameter(key,value);
     if(!size.equals("omitted"))builder.appendQueryParameter("size",size);
     HttpURLConnection connection=(HttpURLConnection)new URL(builder.build().toString()).openConnection();
     connection.setConnectTimeout(6000);connection.setReadTimeout(8000);
     try{
      int status=connection.getResponseCode();output.putInt(size+"_status",status);
      if(status!=200)continue;
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int n;
      try(java.io.InputStream stream=connection.getInputStream()){
       while((n=stream.read(chunk))!=-1){if(bytes.size()+n>8388608)throw new Exception("ImageLimit");bytes.write(chunk,0,n);}
      }
      byte[] data=bytes.toByteArray();BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
      BitmapFactory.decodeByteArray(data,0,data.length,options);
      output.putString(size+"_image",options.outWidth+"x"+options.outHeight+" bytes="+data.length);
     }finally{connection.disconnect();}
    }
   }
  }catch(Throwable error){output.putString("failure",error.getClass().getSimpleName());}
  finally{getUiAutomation().dropShellPermissionIdentity();}
  finish(-1,output);
 }
}
