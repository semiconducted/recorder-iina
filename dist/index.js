"use strict";
(() => {
  // packages/contracts/src/index.ts
  var SECONDS_PATTERN = /^\d+(?:\.\d+)?$/;
  var WHOLE_PATTERN = /^\d+$/;
  function parseTimestamp(text) {
    const parts = text.trim().split(":");
    if (parts.length > 3) return void 0;
    const [seconds = "", minutes, hours] = parts.reverse();
    if (!SECONDS_PATTERN.test(seconds)) return void 0;
    if (minutes !== void 0 && (!WHOLE_PATTERN.test(minutes) || Number(seconds) >= 60)) {
      return void 0;
    }
    if (hours !== void 0 && (!WHOLE_PATTERN.test(hours) || Number(minutes) >= 60)) {
      return void 0;
    }
    return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds);
  }
  function formatTimestamp(positionInSeconds) {
    const safePosition = Number.isFinite(positionInSeconds) ? Math.max(0, positionInSeconds) : 0;
    const totalMilliseconds = Math.round(safePosition * 1e3);
    const hours = Math.floor(totalMilliseconds / 36e5);
    const minutes = Math.floor(totalMilliseconds % 36e5 / 6e4);
    const seconds = Math.floor(totalMilliseconds % 6e4 / 1e3);
    const milliseconds = totalMilliseconds % 1e3;
    return `${[hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")}.${String(milliseconds).padStart(3, "0")}`;
  }

  // packages/plugin/src/ffmpeg.ts
  var FFMPEG_FALLBACK_PATHS = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  var FASTSTART_CONTAINERS = /* @__PURE__ */ new Set(["mp4", "mov", "m4v"]);
  function resolveFfmpegPath(preferredPath, fileInPath) {
    const preferred = typeof preferredPath === "string" ? preferredPath.trim() : "";
    const candidates = [preferred, ...FFMPEG_FALLBACK_PATHS];
    return candidates.find((candidate) => candidate.length > 0 && fileInPath(candidate));
  }
  function isLocalSourcePath(sourcePath) {
    return sourcePath.length > 0 && !sourcePath.includes("://");
  }
  function isValidClipRange(startPosition, endPosition) {
    const start = parseTimestamp(startPosition);
    const end = parseTimestamp(endPosition);
    return start !== void 0 && end !== void 0 && end > start;
  }
  function fileExtension(pathOrName) {
    const lastSlash = pathOrName.lastIndexOf("/");
    const name = lastSlash >= 0 ? pathOrName.slice(lastSlash + 1) : pathOrName;
    const lastDot = name.lastIndexOf(".");
    return lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : "";
  }
  function createClipOutputPath(sourcePath, filename, lossless = true) {
    const lastSlash = sourcePath.lastIndexOf("/");
    const directory = lastSlash >= 0 ? sourcePath.slice(0, lastSlash) : "";
    const lastDot = filename.lastIndexOf(".");
    const basename = (lastDot > 0 ? filename.slice(0, lastDot) : filename).trim() || "clip";
    const sourceExtension = fileExtension(filename);
    const extension = lossless && sourceExtension.length > 0 ? sourceExtension : "mov";
    const outputName = `${basename}_clip.${extension}`;
    return directory ? `${directory}/${outputName}` : lastSlash === 0 ? `/${outputName}` : outputName;
  }
  function createAvailableClipOutputPath(sourcePath, filename, fileExists, lossless = true) {
    const preferredPath = createClipOutputPath(sourcePath, filename, lossless);
    if (!fileExists(preferredPath)) return preferredPath;
    const suffix = `.${fileExtension(preferredPath)}`;
    const stem = preferredPath.slice(0, -suffix.length);
    let index = 2;
    while (fileExists(`${stem}_${index}${suffix}`)) index += 1;
    return `${stem}_${index}${suffix}`;
  }
  function roundToMilliseconds(seconds) {
    return Math.round(seconds * 1e3) / 1e3;
  }
  function createFfmpegArguments(options) {
    const args = [];
    const start = parseTimestamp(options.startPosition);
    const end = parseTimestamp(options.endPosition);
    if (!options.verticalCrop && start !== void 0 && end !== void 0 && end > start) {
      args.push(
        "-ss",
        String(start),
        "-i",
        options.sourcePath,
        "-t",
        String(roundToMilliseconds(end - start))
      );
      args.push("-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero");
      if (FASTSTART_CONTAINERS.has(fileExtension(options.outputPath))) {
        args.push("-movflags", "+faststart");
      }
      args.push(options.outputPath);
      return args;
    }
    if (options.hardwareAcceleration) {
      args.push("-hwaccel", "videotoolbox");
    }
    args.push("-i", options.sourcePath);
    if (start !== void 0 && end !== void 0) {
      args.push("-ss", String(start), "-to", String(end));
    }
    args.push("-vf", "crop=w=ih*(9/16):h=ih:x=(iw-ow)/2:y=0,format=yuv420p");
    if (options.hardwareAcceleration) {
      args.push("-c:v", "h264_videotoolbox", "-q:v", "70");
    } else {
      args.push("-c:v", "libx264", "-crf", "23");
    }
    args.push("-c:a", "copy", "-movflags", "+faststart", options.outputPath);
    return args;
  }

  // packages/plugin/src/recorder.ts
  var overlayHideTimer;
  var marks = /* @__PURE__ */ new Map();
  function postToSidebar(sidebar, name, payload) {
    sidebar.postMessage(name, payload);
  }
  function isProcessVideoClipPayload(value) {
    if (typeof value !== "object" || value === null) return false;
    const payload = value;
    return typeof payload.startPos === "string" && typeof payload.endPos === "string" && isValidClipRange(payload.startPos, payload.endPos) && typeof payload.hwaccel === "boolean" && typeof payload.verticalCrop === "boolean";
  }
  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function displayOverlay(api, message, tone = "neutral", duration = 3e3) {
    const color = tone === "error" ? "#ff6961" : tone === "success" ? "#70d594" : "#f5f6f8";
    api.overlay.simpleMode();
    api.overlay.setContent(`<p>${escapeHtml(message)}</p>`);
    api.overlay.setStyle(
      `p { color: ${color}; font: 600 18px -apple-system, BlinkMacSystemFont, sans-serif; margin-top: 40px; text-align: center; }`
    );
    api.overlay.show();
    if (overlayHideTimer !== void 0) clearTimeout(overlayHideTimer);
    overlayHideTimer = setTimeout(() => {
      api.overlay.hide();
      overlayHideTimer = void 0;
    }, duration);
  }
  function postClipStatus(sidebar, payload) {
    postToSidebar(sidebar, "ffmpeg-status-out", payload);
  }
  function detectFfmpeg(api) {
    return resolveFfmpegPath(
      api.preferences.get("ffmpeg_path"),
      (path) => api.utils.fileInPath(path)
    );
  }
  function postFfmpegAvailability(api) {
    const path = detectFfmpeg(api);
    postToSidebar(api.sidebar, "is-ffmpeg-installed", {
      isInstalled: path !== void 0,
      path: path ?? ""
    });
  }
  function isClipMark(value) {
    return value === "in" || value === "out";
  }
  function markCurrentTime(api, mark) {
    const time = api.mpv.getNumber("time-pos");
    marks.set(mark, time);
    postToSidebar(api.sidebar, "mark", { mark, time });
    displayOverlay(api, `${mark === "in" ? "In" : "Out"} ${formatTimestamp(time)}`, "neutral", 1500);
  }
  async function processVideoClip(api, request) {
    const ffmpegPath = detectFfmpeg(api);
    if (!ffmpegPath) {
      const message = "FFmpeg was not found. Check Recorder preferences.";
      postClipStatus(api.sidebar, { status: false, message, tone: "error" });
      displayOverlay(api, message, "error");
      return;
    }
    const sourcePath = api.mpv.getString("path");
    const filename = api.mpv.getString("filename");
    if (!filename || !isLocalSourcePath(sourcePath)) {
      const message = "Open a local video before creating a clip.";
      postClipStatus(api.sidebar, { status: false, message, tone: "error" });
      displayOverlay(api, message, "error");
      return;
    }
    const outputPath = createAvailableClipOutputPath(
      sourcePath,
      filename,
      (path) => api.utils.fileInPath(path),
      !request.verticalCrop
    );
    const args = createFfmpegArguments({
      sourcePath,
      startPosition: request.startPos,
      endPosition: request.endPos,
      hardwareAcceleration: request.hwaccel,
      verticalCrop: request.verticalCrop,
      outputPath
    });
    api.console.log(`FFmpeg found at ${ffmpegPath}; creating ${outputPath}`);
    postClipStatus(api.sidebar, {
      status: true,
      message: "Creating your clip…",
      tone: "neutral"
    });
    displayOverlay(api, "Creating clip…");
    try {
      const result = await api.utils.exec(ffmpegPath, args);
      if (result.status !== 0) {
        const message2 = `FFmpeg stopped with error code ${result.status}.`;
        api.console.error(result.stderr || message2);
        postClipStatus(api.sidebar, { status: false, message: message2, tone: "error" });
        displayOverlay(api, message2, "error");
        return;
      }
      const lastSlash = outputPath.lastIndexOf("/");
      const outputDirectory = lastSlash >= 0 ? outputPath.slice(0, lastSlash) : "the video folder";
      const message = `Clip saved in ${outputDirectory}`;
      postClipStatus(api.sidebar, { status: false, message, tone: "success" });
      displayOverlay(api, message, "success");
      api.sidebar.hide();
      api.core.resume();
    } catch (error) {
      const message = `Could not create the clip: ${String(error)}`;
      api.console.error(message);
      postClipStatus(api.sidebar, { status: false, message, tone: "error" });
      displayOverlay(api, message, "error");
    }
  }
  function registerSidebarMessages(api) {
    api.sidebar.onMessage("markTime", (payload) => {
      if (typeof payload !== "object" || payload === null) return;
      const { mark } = payload;
      if (isClipMark(mark)) markCurrentTime(api, mark);
    });
    api.sidebar.onMessage("seekTo", (payload) => {
      if (typeof payload !== "object" || payload === null) return;
      const { time } = payload;
      if (typeof time === "number" && Number.isFinite(time) && time >= 0) api.core.seekTo(time);
    });
    api.sidebar.onMessage("processVideoClip", (payload) => {
      if (!isProcessVideoClipPayload(payload)) {
        postClipStatus(api.sidebar, {
          status: false,
          message: "Recorder received an invalid clip request.",
          tone: "error"
        });
        return;
      }
      void processVideoClip(api, payload);
    });
    api.sidebar.onMessage("closeWindow", () => api.sidebar.hide());
    api.sidebar.onMessage("ready", () => {
      postFfmpegAvailability(api);
      for (const [mark, time] of marks) postToSidebar(api.sidebar, "mark", { mark, time });
    });
  }
  function setupRecorder(api) {
    let sidebarLoaded = false;
    const loadSidebar = () => {
      if (sidebarLoaded) return;
      api.sidebar.loadFile("dist/ui/window/index.html");
      registerSidebarMessages(api);
      sidebarLoaded = true;
    };
    const openRecorder = () => {
      if (!api.core.window.loaded) return false;
      loadSidebar();
      api.sidebar.show();
      postFfmpegAvailability(api);
      return true;
    };
    api.menu.addItem(
      api.menu.item(
        "Start Clipping",
        () => {
          openRecorder();
        },
        { keyBinding: "Alt+Shift+r" }
      )
    );
    api.menu.addItem(
      api.menu.item(
        "Set Clip In",
        () => {
          if (openRecorder()) markCurrentTime(api, "in");
        },
        { keyBinding: "Alt+Shift+i" }
      )
    );
    api.menu.addItem(
      api.menu.item(
        "Set Clip Out",
        () => {
          if (openRecorder()) markCurrentTime(api, "out");
        },
        { keyBinding: "Alt+Shift+o" }
      )
    );
    api.event.on("iina.file-loaded", () => {
      marks.clear();
      if (sidebarLoaded) postToSidebar(api.sidebar, "reset", void 0);
    });
    if (api.core.window.loaded) {
      loadSidebar();
    } else {
      api.event.on("iina.window-loaded", loadSidebar);
    }
  }

  // packages/plugin/src/index.ts
  setupRecorder(iina);
})();
