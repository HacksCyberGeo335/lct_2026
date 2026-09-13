# Media regression fixture

`two-minute.webm` is an original synthetic solid-gray VP9 video, 160×90, 1 fps,
120 seconds, without audio. It verifies that uploaded media is not limited to
the 60-second demo timeline. No third-party footage is included.

Generation (ffmpeg is needed only to regenerate, not to run the tests):

```sh
ffmpeg -f lavfi -i color=c=gray:s=160x90:r=1 -t 120 -c:v libvpx-vp9 -crf 45 -b:v 0 -an two-minute.webm
```

`sample-h264.mp4` is an original three-second synthetic test pattern, 160×90,
10 fps, H.264/yuv420p without audio. It checks ordinary MP4 selection, playback
and navigation without any backend requests.

```sh
ffmpeg -f lavfi -i testsrc2=size=160x90:rate=10 -t 3 -c:v libx264 -pix_fmt yuv420p -crf 35 -movflags +faststart -an sample-h264.mp4
```
