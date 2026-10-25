package app.fixmytv.home;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.Drawable;
import android.provider.Settings;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Finds launchable apps, remembers their order and which are hidden, and loads their art. */
final class AppStore {
    private static final String SETTINGS_KEY = "settings";

    /** First-run order for common streaming apps; everything else follows alphabetically. */
    private static final List<String> FAVORITES = Arrays.asList(
            "com.netflix.ninja",
            "com.google.android.youtube.tv",
            "com.apple.atve.androidtv.appletv",
            "com.amazon.amazonvideo.livingroom",
            "com.disney.disneyplus",
            "com.wbd.stream",
            "com.hbo.hbonow",
            "com.hulu.livingroomplus",
            "com.google.android.youtube.tvunplugged",
            "com.spotify.tv.android",
            "com.plexapp.android");

    private final Context context;
    private final PackageManager pm;
    private final SharedPreferences prefs;
    private final Map<String, AppEntry> cache = new HashMap<>();
    private String settingsPackage;

    AppStore(Context context) {
        this.context = context;
        this.pm = context.getPackageManager();
        this.prefs = context.getSharedPreferences("home", Context.MODE_PRIVATE);
    }

    /** All tiles in the saved order, hidden ones included. */
    List<AppEntry> query() {
        Map<String, AppEntry> found = new LinkedHashMap<>();
        Set<String> tvPackages = new HashSet<>();
        Intent tv = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(tv, 0)) {
            if (add(found, ri.activityInfo, false)) tvPackages.add(ri.activityInfo.packageName);
        }
        Intent phone = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(phone, 0)) {
            if (!tvPackages.contains(ri.activityInfo.packageName)) add(found, ri.activityInfo, false);
        }
        ResolveInfo settings = pm.resolveActivity(new Intent(Settings.ACTION_SETTINGS), 0);
        settingsPackage = settings != null && settings.activityInfo != null ? settings.activityInfo.packageName : null;
        boolean listed = false;
        for (AppEntry e : found.values()) listed |= e.packageName.equals(settingsPackage);
        if (settingsPackage != null && !listed) add(found, settings.activityInfo, true);
        return ordered(new ArrayList<>(found.values()));
    }

    private boolean add(Map<String, AppEntry> found, ActivityInfo ai, boolean settings) {
        if (ai == null || context.getPackageName().equals(ai.packageName)) return false;
        String key = settings ? SETTINGS_KEY : new ComponentName(ai.packageName, ai.name).flattenToShortString();
        if (found.containsKey(key)) return false;
        long updated = 0;
        try {
            updated = pm.getPackageInfo(ai.packageName, 0).lastUpdateTime;
        } catch (PackageManager.NameNotFoundException ignored) {
            return false;
        }
        AppEntry entry = cache.get(key);
        if (entry == null || entry.updated != updated) {
            CharSequence label = settings ? "Settings" : ai.loadLabel(pm);
            entry = new AppEntry(key, ai, label, settings, updated);
            cache.put(key, entry);
        }
        found.put(key, entry);
        return true;
    }

    private List<AppEntry> ordered(List<AppEntry> entries) {
        String saved = prefs.getString("order", null);
        final Collator collator = Collator.getInstance();
        if (saved == null) {
            Collections.sort(entries, (a, b) -> {
                int ra = rank(a), rb = rank(b);
                if (ra != rb) return ra - rb;
                return collator.compare(a.label.toString(), b.label.toString());
            });
            return entries;
        }
        List<String> order = Arrays.asList(saved.split("\n"));
        List<AppEntry> known = new ArrayList<>();
        List<AppEntry> fresh = new ArrayList<>();
        for (AppEntry e : entries) (order.contains(e.key) ? known : fresh).add(e);
        Collections.sort(known, (a, b) -> order.indexOf(a.key) - order.indexOf(b.key));
        Collections.sort(fresh, (a, b) -> collator.compare(a.label.toString(), b.label.toString()));
        known.addAll(fresh);
        return known;
    }

    private int rank(AppEntry e) {
        if (e.settings || e.packageName.equals(settingsPackage)) return Integer.MAX_VALUE;
        int i = FAVORITES.indexOf(e.packageName);
        return i < 0 ? FAVORITES.size() : i;
    }

    void saveOrder(List<AppEntry> entries) {
        StringBuilder sb = new StringBuilder();
        for (AppEntry e : entries) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(e.key);
        }
        prefs.edit().putString("order", sb.toString()).apply();
    }

    Set<String> hidden() {
        return new HashSet<>(prefs.getStringSet("hidden", Collections.<String>emptySet()));
    }

    void setHidden(String key, boolean hide) {
        Set<String> hidden = hidden();
        if (hide) hidden.add(key); else hidden.remove(key);
        prefs.edit().putStringSet("hidden", hidden).apply();
    }

    /** Counts launches so the first few can show a hint. */
    int bumpLaunchCount() {
        int n = prefs.getInt("launches", 0) + 1;
        prefs.edit().putInt("launches", n).apply();
        return n;
    }

    /** Loads banner, icon and the blurred backdrop. Runs off the main thread. */
    void load(AppEntry e) {
        if (e.loaded) return;
        Drawable banner = null;
        Drawable icon = null;
        try {
            banner = e.info.loadBanner(pm);
            icon = e.info.loadIcon(pm);
        } catch (RuntimeException ignored) {
            // A broken package resource falls back to the plain tile.
        }
        e.banner = banner;
        e.icon = icon;
        e.tint = Art.averageColor(icon != null ? icon : banner);
        e.ambient = Art.ambient(banner, icon, e.tint);
        e.loaded = true;
    }
}
