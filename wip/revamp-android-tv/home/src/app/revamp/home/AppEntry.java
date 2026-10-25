package app.revamp.home;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Drawable;

/** One tile on the home screen: an installed app, or the system Settings shortcut. */
final class AppEntry {
    final String key;
    final String packageName;
    final ActivityInfo info;
    final CharSequence label;
    final boolean settings;
    final long updated;

    Drawable banner;
    Drawable icon;
    Bitmap ambient;
    int tint = 0xFF2A2A30;
    volatile boolean loaded;

    AppEntry(String key, ActivityInfo info, CharSequence label, boolean settings, long updated) {
        this.key = key;
        this.packageName = info.packageName;
        this.info = info;
        this.label = label;
        this.settings = settings;
        this.updated = updated;
    }

    Intent launchIntent() {
        Intent intent;
        if (settings) {
            intent = new Intent(android.provider.Settings.ACTION_SETTINGS);
        } else {
            intent = new Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
                    .setComponent(new ComponentName(info.packageName, info.name));
        }
        return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
    }
}
