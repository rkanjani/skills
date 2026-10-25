package app.fixmytv.home;

import android.content.Context;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.Interpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/** A rounded 16:9 card with a lift-and-sheen focus effect and a label that appears under it. */
final class Tile extends FrameLayout {
    private static final Interpolator EASE = new DecelerateInterpolator(2f);
    private static final float LIFT = 1.11f;

    final FrameLayout card;
    private final ImageView art;
    private final ImageView glyph;
    private final View sheen;
    private final TextView label;
    private final int cardW;
    private final int cardH;
    private final float dp;
    AppEntry entry;

    Tile(Context context, int cardW, int cardH, int labelH, float dp) {
        super(context);
        this.cardW = cardW;
        this.cardH = cardH;
        this.dp = dp;
        setClipChildren(false);
        setClipToPadding(false);

        final float radius = 12 * dp;
        card = new FrameLayout(context);
        card.setFocusable(true);
        card.setClickable(true);
        card.setLongClickable(true);
        card.setBackgroundColor(0xFF1C1C22);
        card.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radius);
            }
        });
        card.setClipToOutline(true);
        if (Build.VERSION.SDK_INT >= 26) card.setDefaultFocusHighlightEnabled(false);

        art = new ImageView(context);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        card.addView(art, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        glyph = new ImageView(context);
        glyph.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int g = (int) (cardH * 0.58f);
        card.addView(glyph, new LayoutParams(g, g, Gravity.CENTER));

        sheen = new View(context);
        sheen.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[] {0x38FFFFFF, 0x10FFFFFF, 0x00FFFFFF, 0x00FFFFFF}));
        sheen.setAlpha(0f);
        card.addView(sheen, new LayoutParams((int) (cardW * 1.6f), LayoutParams.MATCH_PARENT));

        addView(card, new LayoutParams(cardW, cardH));

        label = new TextView(context);
        label.setTextColor(0xFFFFFFFF);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        label.setShadowLayer(8 * dp, 0, 2 * dp, 0x99000000);
        label.setAlpha(0f);
        LayoutParams lp = new LayoutParams(cardW, labelH);
        lp.topMargin = cardH + (int) (10 * dp);
        addView(label, lp);
    }

    void bind(AppEntry e, boolean dimmed) {
        entry = e;
        card.setContentDescription(e.label);
        label.setText(e.label);
        setAlpha(dimmed ? 0.35f : 1f);
        if (!e.loaded) return;
        if (e.banner != null) {
            art.setImageDrawable(e.banner);
            glyph.setImageDrawable(null);
            card.setBackgroundColor(0xFF1C1C22);
        } else {
            art.setImageDrawable(null);
            glyph.setImageDrawable(e.icon);
            card.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                    new int[] {Art.shade(e.tint, 1.15f), Art.shade(e.tint, 0.7f)}));
        }
    }

    /** Apple TV style focus: the card lifts toward you and a soft sheen slides across it. */
    void focus(boolean focused, boolean showLabel) {
        card.animate()
                .scaleX(focused ? LIFT : 1f)
                .scaleY(focused ? LIFT : 1f)
                .translationZ(focused ? 18 * dp : 0)
                .setDuration(focused ? 220 : 180)
                .setInterpolator(EASE)
                .start();
        if (focused) {
            sheen.setTranslationX(-cardW * 0.55f);
            sheen.animate().alpha(1f).translationX(0f).setDuration(700).setInterpolator(EASE).start();
        } else {
            sheen.animate().alpha(0f).setDuration(160).start();
        }
        label.animate()
                .alpha(focused && showLabel ? 1f : 0f)
                .translationY(focused ? cardH * (LIFT - 1f) / 2f : 0f)
                .setDuration(focused ? 220 : 120)
                .setInterpolator(EASE)
                .start();
    }
}
