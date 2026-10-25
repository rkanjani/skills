package app.fixmytv.home;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;

/** Fixed-column grid. Measures its full height so the parent can slide it instead of scrolling. */
final class TileGrid extends ViewGroup {
    final int cols;
    private final int cellW;
    private final int cellH;
    private final int gapX;
    private final int gapY;
    private final int padLeft;
    private final int padBottom;
    private boolean animateNext;

    TileGrid(Context context, int cols, int cellW, int cellH, int gapX, int gapY, int padLeft, int padBottom) {
        super(context);
        this.cols = cols;
        this.cellW = cellW;
        this.cellH = cellH;
        this.gapX = gapX;
        this.gapY = gapY;
        this.padLeft = padLeft;
        this.padBottom = padBottom;
        setClipChildren(false);
        setClipToPadding(false);
    }

    int rowTop(int row) {
        return row * (cellH + gapY);
    }

    int rows() {
        return (getChildCount() + cols - 1) / cols;
    }

    /** Reorders a tile without removing it, so it keeps focus, and slides the others into place. */
    void move(int from, int to) {
        View v = getChildAt(from);
        detachViewFromParent(from);
        attachViewToParent(v, to, v.getLayoutParams());
        animateNext = true;
        requestLayout();
        invalidate();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int w = MeasureSpec.makeMeasureSpec(cellW, MeasureSpec.EXACTLY);
        int h = MeasureSpec.makeMeasureSpec(cellH, MeasureSpec.EXACTLY);
        for (int i = 0; i < getChildCount(); i++) getChildAt(i).measure(w, h);
        int rows = rows();
        int height = rows == 0 ? 0 : rowTop(rows - 1) + cellH + padBottom;
        setMeasuredDimension(MeasureSpec.getSize(widthSpec), height);
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        DecelerateInterpolator ease = new DecelerateInterpolator(2f);
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            int left = padLeft + (i % cols) * (cellW + gapX);
            int top = rowTop(i / cols);
            int oldLeft = child.getLeft(), oldTop = child.getTop();
            boolean slide = animateNext && child.getWidth() > 0 && (oldLeft != left || oldTop != top);
            child.layout(left, top, left + cellW, top + cellH);
            if (slide) {
                child.setTranslationX(oldLeft - left);
                child.setTranslationY(oldTop - top);
                child.animate().translationX(0).translationY(0).setDuration(240).setInterpolator(ease).start();
            }
        }
        animateNext = false;
    }
}
