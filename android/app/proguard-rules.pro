# R8/ProGuard keep rules for the release build.
#
# Flutter, Firebase, and most plugins ship their own consumer rules, so this
# file only adds the few keeps R8 (full mode) can otherwise strip.

# --- flutter_local_notifications (uses Gson reflection internally) ---
-keep class com.dexterous.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}

# --- Keep annotations Flutter deferred components / Play Core may reference ---
-dontwarn com.google.android.play.core.**
