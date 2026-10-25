# The home screen

`home/` is a complete Android TV home screen in plain Java with no libraries, so it starts instantly and stays small (about 30 KB). It is inspired by the Apple TV home screen, without Apple's names or artwork.

- **Top shelf.** The upper 58% of the screen glows with a blurred, saturated wash of the focused app's banner, with its name in large type and a clock in the corner. The first row is the dock.
- **Grid.** Five 16:9 rounded tiles per row, ordered by popular streaming apps first, then alphabetically, with Settings last.
- **Focus.** The focused tile lifts (scale and shadow), a soft sheen slides across it, and its name fades in under it below the dock row. The whole grid slides as a block; the shelf follows with parallax and dims.
- **Open.** Apps open with a zoom from their tile.
- **Arrange.** Hold OK or press Menu on a tile: Move (the tile wiggles; arrows move it, OK drops it), Hide or Show on Home, App Info, Show Hidden Apps. Order and hidden apps persist.
- **Speed.** Views built in code, art and blurs loaded on two background threads, a 96x54 blur upscaled by the GPU, no RecyclerView or animation libraries. New and removed apps appear without a restart.

## Building

`scripts/build_home.sh` runs aapt2, javac, d8, zipalign and apksigner from the Android SDK. It needs:

- An Android SDK with build-tools and a platform (android-30 or later). Without one: `brew install --cask android-commandlinetools`, then `sdkmanager "build-tools;36.0.0" "platforms;android-36"` (Linux: Android's command-line tools zip).
- JDK 17 or later: `brew install openjdk@17`, or an Android Studio install, whose bundled JDK the script finds.

It signs with a key it creates once at `~/.config/fix-my-tv/home-signing.jks` (password beside it, owner-only), so later builds install over earlier ones. Never commit or print either file.

## Swapping it in

The order matters, because a TV with no working home screen shows a blank screen:

1. `tv.py home install APK`, then `tv.py ui open app.fixmytv.home/.HomeActivity` and `tv.py shot` to see it render with the user's apps.
2. `tv.py home set` makes it the default (`set-home-activity`, plus the home role on Android 10 and later). Stock homes on Android TV and Google TV declare a higher priority, so the Home button usually keeps opening them; `set` says so.
3. `tv.py home verify` presses Home, and when the stock home still wins, opens the new home directly to prove it runs. Only then:
4. `tv.py home stock --disable` turns off the other home screens, presses Home, and turns them back on if the new home doesn't appear. On Google TV it also turns off the setup app (`home-guard` in `packages.tsv`) once setup is complete, because some builds reopen setup when their home is gone.
5. `tv.py home verify --reboot` waits 15 seconds (Android saves package state a few seconds after a change, and an earlier reboot loses it), reboots, and checks again.

What the user gives up when the stock home is off: the stock recommendation rows, the Google TV "For you" tab, and on some Google TV builds, voice search results (the Assistant still answers). Say this before step 4.

## If something goes wrong

- **Blank screen or setup wizard after reboot**: `tv.py restore` re-enables everything that was turned off. Or by hand: `adb shell pm enable com.google.android.apps.tv.launcherx` (or the TV's home package) and `adb shell pm enable com.google.android.tungsten.setupwraith`.
- **Home button still opens the stock home**: the TV's home is still enabled; run step 4, or the vendor home is a different package, which `tv.py home stock` lists.
- **App crashes or looks wrong**: `adb logcat -d | grep -A20 app.fixmytv.home`; fix `home/src`, rebuild, `home install` again (it installs over and keeps the user's order).
- **To go back to stock only**: `tv.py restore --remove-home`.
