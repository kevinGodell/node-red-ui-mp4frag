'use strict';

module.exports = ($scope, events) => {
  const VENDOR_PREFIX = {
    fullscreenchange: (item => {
      return item && item.substring(2);
    })(['onwebkitfullscreenchange', 'onfullscreenchange', 'onmozfullscreenchange', 'onmsfullscreenchange'].find(item => item in document)),
    fullscreen: ['webkitIsFullScreen', 'fullscreen', 'mozFullScreen', 'msFullscreen'].find(item => item in document),
    fullscreenElement: ['webkitCurrentFullScreenElement', 'fullscreenElement', 'mozFullScreenElement', 'msFullscreenElement'].find(item => item in document),
    displayingFullscreen: ['webkitDisplayingFullscreen', 'displayingFullscreen', 'mozDisplayingFullscreen', 'msDisplayingFullscreen'].find(item => item in HTMLVideoElement.prototype),
    presentationMode: ['webkitPresentationMode', 'presentationMode', 'mozPresentationMode', 'msPresentationMode'].find(item => item in HTMLVideoElement.prototype),
    pictureInPictureElement: ['webkitPictureInPictureElement', 'pictureInPictureElement', 'mozPictureInPictureElement', 'msPictureInPictureElement'].find(item => item in document),
  };

  const SOURCE_BUFFER_MODE = 'segments'; // segments | sequence

  const BUFFERED = true;

  const ALL = true;

  const INTERSECTION_OBSERVER_THRESHOLD = 0.5;

  const TOGGLE_LOADING_TIMEOUT = 300;

  const MAX_RETRY = 10;

  const RETRY_DELAY = 1000;

  const SEEKING_LIMITS = {
    near: 1,
    far: 4,
    rate: 1.1,
  };

  const BUFFERED_LIMITS = {
    seconds: 10, // minimum
    segments: 3, // minimum
    rate: 1.1, // add 10% for margin of error
    queued: 5,
  };

  let loadVideo;
  let unloadVideo;
  let videoElement;
  let videoIntersecting;
  let documentVisible;
  let documentFullscreen;
  let videoFullscreen;
  let videoPictureInPicture;
  let intersectionObserver;
  let toggleLoadingTimeout;

  const log = (level, msg) => {
    console[level]({ id: videoElement && videoElement.id, level, msg });
  };

  const noop = () => {
    // log('info', 'noop()');
  };

  const shouldLoad = () => {
    documentVisible = document.visibilityState === 'visible';

    if (typeof VENDOR_PREFIX.fullscreenElement !== 'undefined' && typeof VENDOR_PREFIX.fullscreen !== 'undefined') {
      documentFullscreen = document[VENDOR_PREFIX.fullscreen] === true;

      videoFullscreen = document[VENDOR_PREFIX.fullscreenElement] === videoElement;
    } else if (typeof VENDOR_PREFIX.displayingFullscreen !== 'undefined') {
      documentFullscreen = videoFullscreen = videoElement[VENDOR_PREFIX.displayingFullscreen] === true;
    } else {
      documentFullscreen = videoFullscreen = false;
    }

    videoPictureInPicture =
      (typeof VENDOR_PREFIX.pictureInPictureElement !== 'undefined' && document[VENDOR_PREFIX.pictureInPictureElement] === videoElement) ||
      (typeof VENDOR_PREFIX.presentationMode !== 'undefined' && videoElement[VENDOR_PREFIX.presentationMode] === 'picture-in-picture');

    return videoPictureInPicture === true || (documentVisible === true && ((documentFullscreen === false && videoIntersecting === true) || (documentFullscreen === true && videoFullscreen === true)));
  };

  const hasHlsJs = () => {
    return /* typeof Hls === 'function' && */ Hls.isSupported() === true;
  };

  const hasHlsNative = () => {
    return videoElement.canPlayType('application/vnd.apple.mpegurl') !== '';
  };

  const hasMediaSource = () => {
    return 'MediaSource' in window;
  };

  const waitForIt = (expression, maxRetry, retryDelay) => {
    let attempt = 0;

    return new Promise((resolve, reject) => {
      const checkExpression = () => {
        if (expression() === true) {
          return resolve(true);
        }

        if (++attempt > maxRetry) {
          return reject({ expression: expression.toString(), maxRetry, retryDelay });
        }

        setTimeout(checkExpression, retryDelay);
      };

      checkExpression();
    });
  };

  const stopToggleLoadingTimeout = () => {
    if (typeof toggleLoadingTimeout !== 'undefined') {
      clearTimeout(toggleLoadingTimeout);

      toggleLoadingTimeout = undefined;
    }
  };

  const startToggleLoadingTimeout = () => {
    toggleLoadingTimeout = setTimeout(() => {
      toggleLoadingTimeout = undefined;

      if (shouldLoad() === true) {
        loadVideo();
      } else {
        unloadVideo();

        setVideoPoster(false);
      }
    }, TOGGLE_LOADING_TIMEOUT);
  };

  const extractVideoData = payload => {
    if (!payload) {
      return {
        type: 'empty',
        source: null,
      };
    }

    const { hlsPlaylist, socketIo, mp4Video } = payload;

    for (let i = 0; i < $scope.config.players.length; ++i) {
      switch ($scope.config.players[i]) {
        case 'socket.io':
          if (hasMediaSource() === true) {
            if (typeof socketIo === 'object') {
              const { namespace, path, key } = socketIo;

              if (typeof path === 'string' && typeof namespace === 'string') {
                return {
                  type: 'socket.io',
                  source: { path, namespace, key },
                };
              }
            }
          }

          break;

        case 'hls.js':
          if (hasHlsJs() === true) {
            if (typeof payload === 'string') {
              if (payload.endsWith('.m3u8') === true) {
                return {
                  type: 'hls.js',
                  source: payload,
                };
              }
            }

            if (typeof hlsPlaylist === 'string') {
              if (hlsPlaylist.endsWith('.m3u8') === true) {
                return {
                  type: 'hls.js',
                  source: hlsPlaylist,
                };
              }
            }
          }

          break;

        case 'hls':
          if (hasHlsNative() === true) {
            if (typeof payload === 'string') {
              if (payload.endsWith('.m3u8') === true) {
                return {
                  type: 'hls.js',
                  source: payload,
                };
              }
            }

            if (typeof hlsPlaylist === 'string') {
              if (hlsPlaylist.endsWith('.m3u8') === true) {
                return {
                  type: 'hls',
                  source: hlsPlaylist,
                };
              }
            }
          }

          break;

        case 'mp4':
          if (typeof payload === 'string') {
            if (payload.endsWith('.mp4') === true) {
              return {
                type: 'mp4',
                source: payload,
              };
            }
          }

          if (typeof mp4Video === 'string') {
            if (mp4Video.endsWith('.mp4') === true) {
              return {
                type: 'mp4',
                source: mp4Video,
              };
            }
          }

          break;
      }
    }

    return {
      type: 'unknown',
      source: payload,
    };
  };

  const setVideoPoster = (errored = false) => {
    videoElement.poster = errored === true ? $scope.config.errorPoster : $scope.config.readyPoster;
  };

  const initVideo = (type, source, video) => {
    // type can be socket.io, hls.js, hls, mp4

    switch (type) {
      case 'socket.io':
        {
          let socketIo; // instanceof io.Socket
          let mediaSource; // instanceof MediaSource
          let sourceBuffer; // instanceof SourceBuffer
          let lastTimestamp;
          let lastDuration;
          let lastSequence;
          let lastBufferedStart;
          let maxDuration;
          let queuedSegments;
          let bufferedDurationLimit;
          let seekRange;
          let socketIoLoaded = false;

          const unload = () => {
            if (socketIoLoaded === false) {
              // log('debug', 'socketIo already unloaded');

              return;
            }

            // log('debug', 'socketIo unload');

            socketIoLoaded = false;

            if (typeof socketIo !== 'undefined') {
              socketIo.removeAllListeners('mp4frag_error');

              socketIo.removeAllListeners('error');

              socketIo.removeAllListeners('connect_error');

              socketIo.removeAllListeners('connect_failed');

              socketIo.removeAllListeners('disconnect');

              socketIo.removeAllListeners('reconnect');

              socketIo.removeAllListeners('connect');

              socketIo.removeAllListeners('auth');

              socketIo.removeAllListeners('mime');

              socketIo.removeAllListeners('initialization');

              socketIo.removeAllListeners('segment');

              socketIo.disconnect();

              socketIo.destroy();

              socketIo = undefined;
            }

            if (mediaSource instanceof MediaSource === true) {
              if (sourceBuffer instanceof SourceBuffer === true) {
                if (sourceBuffer.updating === true) {
                  sourceBuffer.abort();
                }

                mediaSource.removeSourceBuffer(sourceBuffer);

                mediaSource.endOfStream();

                sourceBuffer.onerror = undefined;

                sourceBuffer.onupdate = undefined;

                sourceBuffer = undefined;
              }

              mediaSource.onsourceopen = undefined;

              mediaSource = undefined;
            }

            lastTimestamp = undefined;

            lastSequence = undefined;

            lastDuration = undefined;

            lastBufferedStart = undefined;

            maxDuration = undefined;

            queuedSegments = undefined;

            bufferedDurationLimit = undefined;

            seekRange = undefined;

            videoElement.controls = false;

            try {
              videoElement.pause();
            } catch (err) {
              log('warn', `videoElement.pause() - ${err.name} - ${err.message}`);
            }

            videoElement.removeAttribute('src');

            try {
              videoElement.load();
            } catch (err) {
              log('warn', `videoElement.load() - ${err.name} - ${err.message}`);
            }

            videoElement.onloadedmetadata = undefined;

            videoElement.onerror = undefined;
          };

          const load = () => {
            if (socketIoLoaded === true) {
              // log('debug', 'socketIo already loaded');

              return;
            }

            // log('debug', 'socketIo load');

            socketIoLoaded = true;

            lastTimestamp = 0;

            lastSequence = 0;

            lastDuration = 0;

            lastBufferedStart = NaN;

            maxDuration = 0;

            queuedSegments = [];

            bufferedDurationLimit = 0;

            seekRange = { near: 1, far: 10 };

            try {
              const { namespace, path, key } = source;

              const nsp = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${namespace}`;

              // console.log({namespace, path, key});

              socketIo = io(nsp, {
                path: path,
                transports: [/* 'polling', */ 'websocket'],
                forceNew: false, // true,
                timeout: 5000,
                auth: {
                  key: key,
                },
              });
            } catch (err) {
              log('error', `io() - ${err.name} - ${err.message}`);

              stopToggleLoadingTimeout();

              unload();

              setVideoPoster(true);

              return;
            }

            socketIo.on('mp4frag_error', err => {
              log('error', `socketIo on mp4frag_error ${err}`);
            });

            socketIo.on('error', err => {
              log('error', `socketIo on error ${err}`);
            });

            socketIo.on('connect_error', err => {
              log('error', `socketIo on connect_error ${err.message} ${(err.data && err.data.reason) || ''}`);
            });

            socketIo.on('connect_failed', err => {
              log('error', `socketIo on connect_failed ${err}`);
            });

            socketIo.on('disconnect', data => {
              log('debug', `socketIo on disconnect ${data}`);
            });

            socketIo.on('reconnect', data => {
              log('debug', 'socketIo on reconnect');
            });

            socketIo.on('connect', data => {
              log('debug', 'socketIo on connect');
            });

            socketIo.on('auth', data => {
              log('debug', `socketIo on auth ${data}`);

              if (data === true) {
                socketIo.removeAllListeners('auth');

                socketIo.emit('mime');
              } else {
                socketIo.emit('auth', { key: source.key });
              }
            });

            socketIo.on('mime', data => {
              // log('debug', 'socketIo on mime');

              socketIo.removeAllListeners('mime');

              if (MediaSource.isTypeSupported(data) === false) {
                log('error', `MediaSource.isTypeSupported(${data}) === false`);

                stopToggleLoadingTimeout();

                unload();

                setVideoPoster(true);

                return;
              }

              videoElement.onerror = err => {
                log('warn', `videoElement.onerror() - ${err.name} - ${err.message}`);
              };

              videoElement.onloadedmetadata = async event => {
                // log('debug', 'videoElement.onloadedmetadata()');

                videoElement.controls = true;

                try {
                  if ($scope.config.play !== false) {
                    await videoElement.play();
                  }
                } catch (err) {
                  log('warn', `videoElement.play() - ${err.name} - ${err.message}`);
                }
              };

              const mime = data;

              mediaSource = new MediaSource();

              mediaSource.onsourceopen = () => {
                // log('debug', 'mediaSource.onsourceopen()');

                URL.revokeObjectURL(videoElement.src); // todo

                sourceBuffer = mediaSource.addSourceBuffer(mime);

                sourceBuffer.mode = SOURCE_BUFFER_MODE;

                sourceBuffer.onerror = err => {
                  log('warn', `sourceBuffer.onerror() - ${err.name} - ${err.message}`);
                };

                sourceBuffer.onupdate = () => {
                  // log('debug', 'sourceBuffer.onupdate');

                  if (sourceBuffer.updating === true) {
                    log('debug', 'sourceBuffer.updating === true');

                    return;
                  }

                  if (queuedSegments.length > 0) {
                    const segment = queuedSegments.pop();

                    sourceBuffer.appendBuffer(segment);

                    return;
                  }

                  const timeRangesCount = sourceBuffer.buffered.length;

                  if (timeRangesCount > 0) {
                    const oldestBufferedStart = sourceBuffer.buffered.start(0);

                    const newestBufferedStart = sourceBuffer.buffered.start(timeRangesCount - 1);

                    const newestBufferedEnd = sourceBuffer.buffered.end(timeRangesCount - 1);

                    const newestBufferedDuration = newestBufferedEnd - newestBufferedStart;

                    if (lastBufferedStart !== newestBufferedStart && newestBufferedDuration > bufferedDurationLimit * BUFFERED_LIMITS.rate) {
                      lastBufferedStart = newestBufferedStart;

                      sourceBuffer.remove(oldestBufferedStart, newestBufferedStart + newestBufferedDuration - bufferedDurationLimit);
                    } else if (timeRangesCount > 1) {
                      sourceBuffer.remove(oldestBufferedStart, newestBufferedStart);
                    } else {
                      // ok to seek video since we will not be changing source buffer

                      const near = Math.max(newestBufferedStart, newestBufferedEnd - seekRange.near); // closest to realtime

                      const far = Math.max(newestBufferedStart, newestBufferedEnd - seekRange.far); // furthest from realtime

                      const currentTime = videoElement.currentTime;

                      if (currentTime < far || currentTime > near) {
                        const middle = (near + far) / 2;

                        log('debug', `adjust currentTime from ${currentTime} to ${middle}`);

                        videoElement.currentTime = middle;
                      }
                    }
                  }
                };

                socketIo.emit('initialization');
              };

              mediaSource.onsourceclose = () => {
                // log('debug', 'mediaSource.onsourceclose()');
              };

              mediaSource.onsourceclosed = () => {
                // log('debug', 'mediaSource.onsourceclosed()');
              };

              mediaSource.onsourceended = () => {
                // log('debug', 'mediaSource.onsourceended()');
              };

              videoElement.src = URL.createObjectURL(mediaSource); // triggers mediaSource open event
            });

            socketIo.on('initialization', data => {
              // log('debug', 'socketIo on initialization');

              socketIo.removeAllListeners('initialization');

              if (data instanceof ArrayBuffer === false) {
                log('error', 'data instanceof ArrayBuffer === false');

                stopToggleLoadingTimeout();

                unload();

                setVideoPoster(true);

                return;
              }

              if (sourceBuffer.updating === true) {
                log('error', 'sourceBuffer.updating === true');

                stopToggleLoadingTimeout();

                unload();

                setVideoPoster(true);

                return;
              }

              mediaSource.duration = Number.POSITIVE_INFINITY;

              sourceBuffer.appendBuffer(data);

              socketIo.emit('segment', { buffered: BUFFERED, all: ALL });
            });

            let onsegment = 0;

            socketIo.on('segment', data => {
              const { segment, duration, timestamp, sequence } = data;

              if (segment instanceof ArrayBuffer === false) {
                log('error', 'segment instanceof ArrayBuffer === false');

                stopToggleLoadingTimeout();

                unload();

                setVideoPoster(true);

                return;
              }

              if (lastSequence > 0 && sequence !== lastSequence + 1) {
                log('warn', `sequence skipped from ${lastSequence} to ${sequence}`);
              }

              maxDuration = Math.max(lastDuration, duration);

              bufferedDurationLimit = Math.max(BUFFERED_LIMITS.seconds, BUFFERED_LIMITS.segments * maxDuration);

              seekRange = { near: SEEKING_LIMITS.near * maxDuration, far: SEEKING_LIMITS.far * maxDuration };

              lastTimestamp = timestamp;

              lastSequence = sequence;

              lastDuration = duration;

              if (sourceBuffer.updating === true || queuedSegments.length > 0) {
                queuedSegments.push(segment);

                if (queuedSegments.length > BUFFERED_LIMITS.queued) {
                  log('warn', `queued segments exceeded limit of ${BUFFERED_LIMITS.queued} with ${queuedSegments.length}`);
                  queuedSegments = [];
                }
              } else {
                sourceBuffer.appendBuffer(segment);
              }

              if (ALL === false) {
                socketIo.emit('segment', { timestamp: lastTimestamp });
              }
            });
          };

          return {
            load,
            unload,
          };
        }

        break;
      case 'hls.js':
        {
          let hlsJsPlayer;
          let hlsJsLoaded = false;

          const unload = () => {
            if (hlsJsLoaded === false) {
              // log('debug', 'hlsJs already unloaded');

              return;
            }

            // log('debug', 'hlsJs unload');

            hlsJsLoaded = false;

            if (typeof hlsJsPlayer === 'object' && typeof hlsJsPlayer.destroy === 'function') {
              hlsJsPlayer.destroy();

              hlsJsPlayer = undefined;
            }

            videoElement.controls = false;

            videoElement.pause();

            videoElement.removeAttribute('src');

            videoElement.load();
          };

          const load = () => {
            if (hlsJsLoaded === true) {
              // log('debug', 'hlsJs already loaded');

              return;
            }

            // log('debug', 'hlsJs load');

            hlsJsLoaded = true;

            hlsJsPlayer = new Hls($scope.config.hlsJsConfig);

            hlsJsPlayer.loadSource(source);

            hlsJsPlayer.attachMedia(videoElement);

            // todo check config.autoplay
            hlsJsPlayer.on(Hls.Events.MANIFEST_PARSED, async () => {
              try {
                if ($scope.config.play !== false) {
                  await videoElement.play();
                }

                videoElement.controls = true;
              } catch (err) {
                log('warn', `videoElement.play() - ${err.name} - ${err.message}`);
              }
            });

            hlsJsPlayer.on(Hls.Events.ERROR, (event, data) => {
              const { type, details, fatal } = data;
              if (fatal) {
                switch (type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    log('warn', details);
                    hlsJsPlayer.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    log('warn', details);
                    hlsJsPlayer.recoverMediaError();
                    break;
                  case Hls.ErrorTypes.OTHER_ERROR:
                  default:
                    log('error', data);

                    stopToggleLoadingTimeout();

                    unload();

                    setVideoPoster(true);

                    break;
                }
              }
            });
          };

          return {
            load,
            unload,
          };
        }

        break;
      case 'hls':
        {
          let hlsLoaded = false;

          const unload = () => {
            if (hlsLoaded === false) {
              // log('debug', 'hls already unloaded');

              return;
            }

            // log('debug', 'hls unload');

            hlsLoaded = false;

            videoElement.onloadedmetadata = undefined;

            videoElement.controls = false;

            videoElement.pause();

            videoElement.removeAttribute('src');

            videoElement.load();

            videoElement.onerror = undefined;
          };

          const load = () => {
            if (hlsLoaded === true) {
              // log('debug', 'hls already loaded');

              return;
            }

            // log('debug', 'hls load');

            hlsLoaded = true;

            videoElement.onerror = err => {
              log('warn', `videoElement.onerror() - ${err.name} - ${err.message}`);
            };

            videoElement.onloadedmetadata = async event => {
              // log('debug', 'videoElement.onloadedmetadata()');

              videoElement.controls = true;

              try {
                if ($scope.config.play !== false) {
                  await videoElement.play();
                }
              } catch (err) {
                log('warn', `videoElement.play() - ${err.name} - ${err.message}`);
              }
            };

            videoElement.src = source;
          };

          return {
            load,
            unload,
          };
        }

        break;
      case 'mp4':
        {
          let mp4Loaded = false;

          const unload = () => {
            if (mp4Loaded === false) {
              // log('debug', 'mp4 already unloaded');

              return;
            }

            // log('debug', 'mp4 unload');

            mp4Loaded = false;

            videoElement.onloadedmetadata = undefined;

            videoElement.controls = false;

            videoElement.pause();

            videoElement.removeAttribute('src');

            videoElement.load();

            videoElement.onerror = undefined;
          };

          const load = () => {
            if (mp4Loaded === true) {
              // log('debug', 'mp4 already loaded');

              return;
            }

            // log('debug', 'mp4 load');

            mp4Loaded = true;

            videoElement.onerror = err => {
              log('warn', `videoElement.onerror() - ${err.name} - ${err.message}`);
            };

            videoElement.onloadedmetadata = async event => {
              // log('debug', 'videoElement.onloadedmetadata()');

              videoElement.controls = true;

              try {
                if ($scope.config.play !== false) {
                  await videoElement.play();
                }
              } catch (err) {
                log('warn', `videoElement.play() - ${err.name} - ${err.message}`);
              }
            };

            videoElement.src = source;
          };

          return {
            load,
            unload,
          };
        }

        break;
      case 'empty':
        // log('debug', 'empty playlist');

        return {
          load: noop,
          unload: noop,
        };

        break;
      default:
        // log('debug', 'do not init video');

        return {
          load: noop,
          unload: noop,
        };
    }
  };

  const handleIntersectChange = data => {
    // log('debug', 'handleIntersectChange');

    stopToggleLoadingTimeout();

    videoIntersecting = data[0].length === 1 ? data[0].isIntersecting : data[data.length - 1].isIntersecting;

    startToggleLoadingTimeout();
  };

  const handleVisibilityChange = () => {
    // log('debug', 'handleVisibilityChange');

    stopToggleLoadingTimeout();

    startToggleLoadingTimeout();
  };

  const handleFullscreenChange = () => {
    // log('debug', 'handleFullscreenChange');

    stopToggleLoadingTimeout();

    startToggleLoadingTimeout();
  };

  // function called by ng-init='init(${JSON.stringify(config)})'
  $scope.init = config => {
    $scope.config = config;

    loadVideo = noop;

    unloadVideo = noop;

    videoElement = document.getElementById(config.videoID);

    if (config.unload !== false) {
      videoIntersecting = false; // todo check bounds and availability of IntersectionObserver

      intersectionObserver = new IntersectionObserver(handleIntersectChange, {
        root: document.querySelector('section.ng-scope') || null,
        rootMargin: '0px',
        threshold: [$scope.config.threshold || INTERSECTION_OBSERVER_THRESHOLD],
      });

      intersectionObserver.observe(videoElement);

      document.addEventListener('visibilitychange', handleVisibilityChange);

      if (typeof VENDOR_PREFIX.fullscreenchange !== 'undefined') {
        document.addEventListener(VENDOR_PREFIX.fullscreenchange, handleFullscreenChange);
      }
    }
  };

  $scope.$watch('msg', async (newVal, oldVal) => {
    if (typeof newVal === 'undefined') {
      return;
    }

    stopToggleLoadingTimeout();

    unloadVideo();

    setVideoPoster(false);

    // todo switch(msg.topic)...

    try {
      await waitForIt(() => typeof Hls === 'function', MAX_RETRY, RETRY_DELAY);

      await waitForIt(() => typeof io === 'function', MAX_RETRY, RETRY_DELAY);

      const { type, source } = extractVideoData(newVal.payload);

      ({ load: loadVideo, unload: unloadVideo } = initVideo(type, source));

      if ($scope.config.unload === false) {
        loadVideo();
      } else {
        stopToggleLoadingTimeout();

        startToggleLoadingTimeout();
      }
    } catch (err) {
      log('error', err);

      stopToggleLoadingTimeout();

      unloadVideo();

      setVideoPoster(true);
    }
  });

  $scope.$on('$destroy', () => {
    // log('debug', '$scope on destroy');

    if ($scope.config.unload !== false) {
      stopToggleLoadingTimeout();

      if (typeof VENDOR_PREFIX.fullscreenchange !== 'undefined') {
        document.removeEventListener(VENDOR_PREFIX.fullscreenchange, handleFullscreenChange);
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange);

      intersectionObserver.unobserve(videoElement);
    }

    unloadVideo();

    setVideoPoster(false);
  });
};
