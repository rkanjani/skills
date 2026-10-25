package app.revamp.home;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;

/** Small, cheap image work: dominant color and a blurred backdrop rendered at thumbnail size. */
final class Art {
    private static final int AMBIENT_W = 96;
    private static final int AMBIENT_H = 54;

    private Art() {}

    static int averageColor(Drawable d) {
        if (d == null) return 0xFF2A2A30;
        Bitmap b = Bitmap.createBitmap(12, 12, Bitmap.Config.ARGB_8888);
        d.setBounds(0, 0, 12, 12);
        d.draw(new Canvas(b));
        long r = 0, g = 0, bl = 0, weight = 0;
        for (int y = 0; y < 12; y++) {
            for (int x = 0; x < 12; x++) {
                int c = b.getPixel(x, y);
                int a = Color.alpha(c);
                // Favor saturated pixels so a white logo on a red field reads as red.
                int max = Math.max(Color.red(c), Math.max(Color.green(c), Color.blue(c)));
                int min = Math.min(Color.red(c), Math.min(Color.green(c), Color.blue(c)));
                int w = a * (32 + max - min);
                r += (long) Color.red(c) * w;
                g += (long) Color.green(c) * w;
                bl += (long) Color.blue(c) * w;
                weight += w;
            }
        }
        b.recycle();
        if (weight == 0) return 0xFF2A2A30;
        return Color.rgb((int) (r / weight), (int) (g / weight), (int) (bl / weight));
    }

    static int shade(int color, float factor) {
        return Color.rgb(
                Math.min(255, (int) (Color.red(color) * factor)),
                Math.min(255, (int) (Color.green(color) * factor)),
                Math.min(255, (int) (Color.blue(color) * factor)));
    }

    static Bitmap ambient(Drawable banner, Drawable icon, int tint) {
        Bitmap b = Bitmap.createBitmap(AMBIENT_W, AMBIENT_H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(shade(tint, 0.55f));
        if (banner != null) {
            // Laid over the app's own color at partial strength, so white banners still glow in color.
            banner.setBounds(0, 0, AMBIENT_W, AMBIENT_H);
            c.saveLayerAlpha(0, 0, AMBIENT_W, AMBIENT_H, 150);
            banner.draw(c);
            c.restore();
        } else if (icon != null) {
            int s = (int) (AMBIENT_H * 0.9f);
            int l = (AMBIENT_W - s) / 2, t = (AMBIENT_H - s) / 2;
            icon.setBounds(l, t, l + s, t + s);
            icon.draw(c);
        }
        blur(b, 6, 3);
        return b;
    }

    /** Repeated box blur, which converges on a gaussian. Fine at thumbnail size. */
    static void blur(Bitmap bitmap, int radius, int passes) {
        int w = bitmap.getWidth(), h = bitmap.getHeight();
        int[] a = new int[w * h];
        int[] t = new int[w * h];
        bitmap.getPixels(a, 0, w, 0, 0, w, h);
        for (int i = 0; i < passes; i++) {
            pass(a, t, w, h, radius);
            pass(t, a, h, w, radius);
        }
        bitmap.setPixels(a, 0, w, 0, 0, w, h);
    }

    /** Blurs each row of src and writes it transposed, so two calls blur both axes. */
    private static void pass(int[] src, int[] dst, int w, int h, int r) {
        int div = 2 * r + 1;
        for (int y = 0; y < h; y++) {
            int row = y * w;
            int sa = 0, sr = 0, sg = 0, sb = 0;
            for (int i = -r; i <= r; i++) {
                int c = src[row + Math.min(w - 1, Math.max(0, i))];
                sa += c >>> 24; sr += (c >> 16) & 255; sg += (c >> 8) & 255; sb += c & 255;
            }
            for (int x = 0; x < w; x++) {
                dst[x * h + y] = ((sa / div) << 24) | ((sr / div) << 16) | ((sg / div) << 8) | (sb / div);
                int in = src[row + Math.min(w - 1, x + r + 1)];
                int out = src[row + Math.max(0, x - r)];
                sa += (in >>> 24) - (out >>> 24);
                sr += ((in >> 16) & 255) - ((out >> 16) & 255);
                sg += ((in >> 8) & 255) - ((out >> 8) & 255);
                sb += (in & 255) - (out & 255);
            }
        }
    }
}
