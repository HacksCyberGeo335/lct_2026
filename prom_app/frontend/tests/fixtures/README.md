# Media regression fixture

`two-minute.webm` is an original synthetic solid-gray VP9 video, 160×90, 1 fps,
120 seconds, without audio. It verifies that uploaded media is not limited to
the 60-second demo timeline. No third-party footage is included.

Generation (ffmpeg is needed only to regenerate, not to run the tests):

```sh
ffmpeg -f lavfi -i color=c=gray:s=160x90:r=1 -t 120 -c:v libvpx-vp9 -crf 45 -b:v 0 -an two-minute.webm
```
