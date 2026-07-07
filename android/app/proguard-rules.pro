# ---- Capacitor / Cordova bridge (loaded via reflection) ----
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
  @com.getcapacitor.annotation.CapacitorPlugin <fields>;
}
-keepclassmembers class * {
  @com.getcapacitor.PluginMethod public <methods>;
}
-keep class org.apache.cordova.** { *; }
-keep class **.BuildConfig { *; }

# ---- WebView JavaScript interface ----
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# ---- Google Play services auth (safe-keep; has consumer rules too) ----
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ---- Standard attributes / reflection-safety ----
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

-keepclassmembers enum * {
  public static **[] values();
  public static ** valueOf(java.lang.String);
}
-keepclasseswithmembernames class * {
  native <methods>;
}
-keepclassmembers class * implements android.os.Parcelable {
  public static final ** CREATOR;
}
