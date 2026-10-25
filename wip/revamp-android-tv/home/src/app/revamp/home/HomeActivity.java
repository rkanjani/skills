package app.revamp.home;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.ActivityOptions;
import android.app.Dialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.Interpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The home screen: a top shelf that glows with the focused app's colors, a dock row under it,
 * and the rest of the apps in a grid below. Hold OK (or press Menu) on a tile to move or hide it.
 */
public final class HomeActivity extends Activity {
    private static final int COLS = 5;
    private static final Interpolator EASE = new DecelerateInterpolator(1.8f);

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<AppEntry> apps = new ArrayList<>();
    private final List<AppEntry> shown = new ArrayList<>();

    private AppStore store;
    private ExecutorService loader;
    private float dp;
    private int screenW;
    private int screenH;
    private int shelfH;
    private int cardW;
    private int cardH;
    private int labelH;

    private FrameLayout content;
    private TileGrid grid;
    private View heroLayer;
    private ImageView heroBack;
    private ImageView heroFront;
    private TextView heroTitle;
    private TextView heroHint;
    private TextClock clock;

    private float scroll;
    private ValueAnimator scrollAnim;
    private int focused;
    private int moving = -1;
    private ObjectAnimator jiggle;
    private boolean showHidden;
    private Bitmap heroShown;
    private Runnable pendingHero;
    private Dialog menu;
    private BroadcastReceiver packages;
    private final Runnable reload = this::reload;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        DisplayMetrics m = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(m);
        dp = m.density;
        screenW = Math.max(m.widthPixels, m.heightPixels);
        screenH = Math.min(m.widthPixels, m.heightPixels);
        store = new AppStore(this);
        loader = Executors.newFixedThreadPool(2, r -> new Thread(() -> {
            Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
            r.run();
        }, "home-loader"));
        setContentView(buildViews());
        reload();
        listenForPackages();
    }

    private View buildViews() {
        int side = (int) (screenW * 0.055f);
        int gapX = (int) (screenW * 0.024f);
        cardW = (screenW - 2 * side - gapX * (COLS - 1)) / COLS;
        cardH = cardW * 9 / 16;
        labelH = (int) (34 * dp);
        shelfH = (int) (screenH * 0.58f);

        FrameLayout root = new FrameLayout(this);
        root.setClipChildren(false);
        root.setBackgroundColor(0xFF0B0B0F);

        FrameLayout hero = new FrameLayout(this);
        heroLayer = hero;
        ColorMatrix look = new ColorMatrix();
        look.setSaturation(1.45f);
        ColorMatrix dim = new ColorMatrix();
        dim.setScale(0.66f, 0.66f, 0.66f, 1f);
        look.postConcat(dim);
        heroBack = heroImage(look);
        heroFront = heroImage(look);
        heroFront.setAlpha(0f);
        hero.addView(heroBack, full());
        hero.addView(heroFront, full());
        View scrim = new View(this);
        scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {
                0x73000000, 0x00000000, 0x00000000, 0x330B0B0F, 0xE60B0B0F, 0xFF0B0B0F}));
        hero.addView(scrim, full());

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        text.setGravity(Gravity.BOTTOM);
        heroTitle = new TextView(this);
        heroTitle.setTextColor(0xFFFFFFFF);
        heroTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        heroTitle.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        heroTitle.setLetterSpacing(-0.01f);
        heroTitle.setSingleLine(true);
        heroTitle.setEllipsize(TextUtils.TruncateAt.END);
        heroTitle.setShadowLayer(16 * dp, 0, 2 * dp, 0x80000000);
        text.addView(heroTitle);
        heroHint = new TextView(this);
        heroHint.setTextColor(0xB3FFFFFF);
        heroHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        heroHint.setVisibility(View.GONE);
        text.addView(heroHint);
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(screenW - 2 * side, shelfH - (int) (22 * dp));
        tp.leftMargin = side;
        hero.addView(text, tp);
        root.addView(hero, new FrameLayout.LayoutParams(screenW, screenH));

        content = new FrameLayout(this);
        content.setClipChildren(false);
        grid = new TileGrid(this, COLS, cardW, cardH + labelH, gapX, (int) (screenH * 0.035f), side, (int) (screenH * 0.2f));
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(screenW, ViewGroup.LayoutParams.WRAP_CONTENT);
        gp.topMargin = shelfH;
        content.addView(grid, gp);
        root.addView(content, full());

        clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setFormat24Hour("H:mm");
        clock.setTextColor(0xE6FFFFFF);
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        clock.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        clock.setShadowLayer(10 * dp, 0, 1 * dp, 0x66000000);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        cp.topMargin = (int) (screenH * 0.06f);
        cp.rightMargin = side;
        root.addView(clock, cp);

        if (store.bumpLaunchCount() <= 3) {
            heroHint.setText("Hold OK on an app to move or hide it");
            heroHint.setVisibility(View.VISIBLE);
        }
        return root;
    }

    private ImageView heroImage(ColorMatrix look) {
        ImageView v = new ImageView(this);
        v.setScaleType(ImageView.ScaleType.CENTER_CROP);
        v.setColorFilter(new ColorMatrixColorFilter(look));
        return v;
    }

    private static FrameLayout.LayoutParams full() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    // ---- Apps ----

    private void reload() {
        String keep = focused < shown.size() ? shown.get(focused).key : null;
        apps.clear();
        apps.addAll(store.query());
        rebuild(keep);
    }

    private void rebuild(String focusKey) {
        Set<String> hidden = store.hidden();
        shown.clear();
        for (AppEntry e : apps) if (showHidden || !hidden.contains(e.key)) shown.add(e);
        grid.removeAllViews();
        int target = 0;
        for (int i = 0; i < shown.size(); i++) {
            final AppEntry e = shown.get(i);
            final Tile tile = new Tile(this, cardW, cardH, labelH, dp);
            final boolean dim = hidden.contains(e.key);
            tile.bind(e, dim);
            wire(tile);
            grid.addView(tile);
            if (e.key.equals(focusKey)) target = i;
            if (!e.loaded) {
                loader.execute(() -> {
                    store.load(e);
                    ui.post(() -> {
                        if (tile.entry != e) return;
                        tile.bind(e, dim);
                        if (focused < shown.size() && shown.get(focused) == e && focused < COLS) showHero(e);
                    });
                });
            }
        }
        final int index = target;
        grid.post(() -> {
            Tile t = tile(index);
            if (t != null) t.card.requestFocus();
        });
    }

    private void wire(final Tile tile) {
        tile.card.setOnFocusChangeListener((v, has) -> {
            int index = grid.indexOfChild(tile);
            if (index < 0) return;
            int row = index / COLS;
            tile.focus(has, row > 0);
            if (!has) return;
            focused = index;
            scrollTo(row == 0 ? 0 : Math.max(0, shelfH + grid.rowTop(row) - screenH * 0.30f));
            if (row == 0) scheduleHero(tile.entry);
        });
        tile.card.setOnClickListener(v -> launch(tile));
        tile.card.setOnLongClickListener(v -> {
            openMenu(grid.indexOfChild(tile));
            return true;
        });
    }

    private Tile tile(int index) {
        return index >= 0 && index < grid.getChildCount() ? (Tile) grid.getChildAt(index) : null;
    }

    private void launch(Tile tile) {
        try {
            Bundle options = ActivityOptions.makeScaleUpAnimation(
                    tile.card, 0, 0, tile.card.getWidth(), tile.card.getHeight()).toBundle();
            startActivity(tile.entry.launchIntent(), options);
        } catch (RuntimeException e) {
            Toast.makeText(this, "Couldn't open " + tile.entry.label, Toast.LENGTH_SHORT).show();
        }
    }

    // ---- Motion ----

    private void scrollTo(float target) {
        if (scrollAnim != null) scrollAnim.cancel();
        if (Math.abs(target - scroll) < 1) return;
        scrollAnim = ValueAnimator.ofFloat(scroll, target);
        scrollAnim.setDuration(320);
        scrollAnim.setInterpolator(EASE);
        scrollAnim.addUpdateListener(a -> applyScroll((float) a.getAnimatedValue()));
        scrollAnim.start();
    }

    private void applyScroll(float s) {
        scroll = s;
        content.setTranslationY(-s);
        heroLayer.setTranslationY(-s * 0.4f);
        float f = Math.min(1f, s / (shelfH * 0.7f));
        heroLayer.setAlpha(1f - 0.72f * f);
        float text = Math.max(0f, 1f - 2f * f);
        heroTitle.setAlpha(text);
        heroHint.setAlpha(text);
        clock.setAlpha(1f - f);
    }

    private void scheduleHero(final AppEntry e) {
        if (pendingHero != null) ui.removeCallbacks(pendingHero);
        pendingHero = () -> showHero(e);
        ui.postDelayed(pendingHero, 60);
    }

    /** Crossfades the shelf to the app's blurred colors and slides its name in. */
    private void showHero(AppEntry e) {
        if (!TextUtils.equals(heroTitle.getText(), e.label)) {
            heroTitle.animate().cancel();
            heroTitle.setText(e.label);
            heroTitle.setAlpha(0f);
            heroTitle.setTranslationX(14 * dp);
            float target = Math.max(0f, 1f - 2f * Math.min(1f, scroll / (shelfH * 0.7f)));
            heroTitle.animate().alpha(target).translationX(0f).setDuration(300).setInterpolator(EASE).start();
        }
        final Bitmap b = e.ambient;
        if (b == null || b == heroShown) return;
        heroShown = b;
        heroFront.animate().cancel();
        if (heroFront.getAlpha() > 0.5f) heroBack.setImageDrawable(heroFront.getDrawable());
        heroFront.setImageBitmap(b);
        heroFront.setAlpha(0f);
        heroFront.animate().alpha(1f).setDuration(480).setInterpolator(EASE).withEndAction(() -> {
            heroBack.setImageBitmap(b);
            heroFront.setAlpha(0f);
        }).start();
    }

    // ---- Menu, move and hide ----

    private void openMenu(final int index) {
        Tile tile = tile(index);
        if (tile == null) return;
        tile.card.setPressed(false);
        final AppEntry e = tile.entry;
        final Set<String> hidden = store.hidden();
        final Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (14 * dp);
        panel.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xF2232328);
        bg.setCornerRadius(20 * dp);
        panel.setBackground(bg);

        TextView title = new TextView(this);
        title.setText(e.label);
        title.setTextColor(0x99FFFFFF);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        title.setPadding(pad, pad / 2, pad, pad);
        panel.addView(title);

        item(d, panel, "Move", () -> startMove(index));
        if (!e.settings) {
            boolean isHidden = hidden.contains(e.key);
            item(d, panel, isHidden ? "Show on Home" : "Hide", () -> {
                store.setHidden(e.key, !isHidden);
                rebuild(e.key);
            });
            item(d, panel, "App Info", () -> {
                Intent info = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", e.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(info);
                } catch (RuntimeException ignored) {
                    Toast.makeText(this, "App info isn't available on this TV", Toast.LENGTH_SHORT).show();
                }
            });
        }
        if (!hidden.isEmpty()) {
            item(d, panel, showHidden ? "Hide Hidden Apps" : "Show Hidden Apps (" + hidden.size() + ")", () -> {
                showHidden = !showHidden;
                rebuild(e.key);
            });
        }

        d.setContentView(panel);
        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(0));
            w.setLayout((int) (screenW * 0.24f), ViewGroup.LayoutParams.WRAP_CONTENT);
            w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setDimAmount(0.55f);
        }
        menu = d;
        d.show();
        panel.getChildAt(1).requestFocus();
    }

    private void item(final Dialog d, LinearLayout panel, String text, final Runnable action) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        v.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        v.setTextColor(new ColorStateList(
                new int[][] {{android.R.attr.state_focused}, {}}, new int[] {0xFF111114, 0xFFFFFFFF}));
        int px = (int) (16 * dp), py = (int) (12 * dp);
        v.setPadding(px, py, px, py);
        v.setFocusable(true);
        v.setClickable(true);
        GradientDrawable on = new GradientDrawable();
        on.setColor(0xFFFFFFFF);
        on.setCornerRadius(12 * dp);
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[] {android.R.attr.state_focused}, on);
        states.addState(new int[] {}, new ColorDrawable(0));
        v.setBackground(states);
        if (Build.VERSION.SDK_INT >= 26) v.setDefaultFocusHighlightEnabled(false);
        v.setOnClickListener(x -> {
            d.dismiss();
            action.run();
        });
        panel.addView(v);
    }

    private void startMove(int index) {
        Tile tile = tile(index);
        if (tile == null) return;
        moving = index;
        tile.card.requestFocus();
        jiggle = ObjectAnimator.ofFloat(tile.card, View.ROTATION, -1.3f, 1.3f);
        jiggle.setDuration(140);
        jiggle.setRepeatCount(ValueAnimator.INFINITE);
        jiggle.setRepeatMode(ValueAnimator.REVERSE);
        jiggle.start();
    }

    private boolean moveKey(int code) {
        int to = moving;
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_LEFT: to--; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: to++; break;
            case KeyEvent.KEYCODE_DPAD_UP: to -= COLS; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: to += COLS; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                endMove();
                return true;
            default:
                return true;
        }
        to = Math.max(0, Math.min(shown.size() - 1, to));
        if (to == moving) return true;
        shown.add(to, shown.remove(moving));
        grid.move(moving, to);
        moving = to;
        int row = to / COLS;
        scrollTo(row == 0 ? 0 : Math.max(0, shelfH + grid.rowTop(row) - screenH * 0.30f));
        return true;
    }

    private void endMove() {
        if (moving < 0) return;
        if (jiggle != null) jiggle.cancel();
        Tile tile = tile(moving);
        if (tile != null) tile.card.animate().rotation(0f).setDuration(120).start();
        List<AppEntry> order = new ArrayList<>(shown);
        for (AppEntry e : apps) if (!order.contains(e)) order.add(e);
        apps.clear();
        apps.addAll(order);
        store.saveOrder(order);
        focused = moving;
        moving = -1;
        if (focused < COLS) showHero(shown.get(focused));
    }

    private void goTop() {
        Tile first = tile(0);
        if (first != null) first.card.requestFocus();
        scrollTo(0);
    }

    // ---- Keys and lifecycle ----

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (moving >= 0) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) return moveKey(event.getKeyCode());
            return true;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getKeyCode() == KeyEvent.KEYCODE_MENU) {
            openMenu(focused);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        goTop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (menu != null && menu.isShowing()) menu.dismiss();
        endMove();
        goTop();
    }

    private void listenForPackages() {
        packages = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                ui.removeCallbacks(reload);
                ui.postDelayed(reload, 400);
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(packages, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(packages, f);
        }
    }

    @Override
    protected void onDestroy() {
        if (packages != null) unregisterReceiver(packages);
        loader.shutdownNow();
        super.onDestroy();
    }
}
