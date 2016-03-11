/**
 * Viewer class
 * @param options (Object) Viewer settings
 */
function PhotoSphereViewer(options) {
  if (!(this instanceof PhotoSphereViewer)) {
    return new PhotoSphereViewer(options);
  }

  if (!PhotoSphereViewer.SYSTEM.loaded) {
    PhotoSphereViewer.loadSystem();
  }

  this.config = PSVUtils.deepmerge(PhotoSphereViewer.DEFAULTS, options);

  // normalize config
  this.config.min_fov = PSVUtils.stayBetween(this.config.min_fov, 1, 179);
  this.config.max_fov = PSVUtils.stayBetween(this.config.max_fov, 1, 179);
  this.config.tilt_up_max = PSVUtils.stayBetween(PSVUtils.parseAngle(this.config.tilt_up_max, -Math.PI), -PSVUtils.HalfPI, PSVUtils.HalfPI);
  this.config.tilt_down_max = PSVUtils.stayBetween(PSVUtils.parseAngle(this.config.tilt_down_max, -Math.PI), -PSVUtils.HalfPI, PSVUtils.HalfPI);
  if (this.config.default_fov === null) {
    this.config.default_fov = this.config.max_fov / 2 + this.config.min_fov / 2;
  }
  else {
    this.config.default_fov = PSVUtils.stayBetween(this.config.default_fov, this.config.min_fov, this.config.max_fov);
  }
  this.config.default_long = PSVUtils.parseAngle(this.config.default_long);
  this.config.default_lat = PSVUtils.stayBetween(PSVUtils.parseAngle(this.config.default_lat, -Math.PI), -PSVUtils.HalfPI, PSVUtils.HalfPI);
  if (this.config.anim_lat === null) {
    this.config.anim_lat = this.config.default_lat;
  }
  else {
    this.config.anim_lat = PSVUtils.stayBetween(PSVUtils.parseAngle(this.config.anim_lat, -Math.PI), -PSVUtils.HalfPI, PSVUtils.HalfPI);
  }
  this.config.long_offset = PSVUtils.parseAngle(this.config.long_offset);
  this.config.lat_offset = PSVUtils.parseAngle(this.config.lat_offset);
  this.config.anim_speed = PSVUtils.parseSpeed(this.config.anim_speed);
  if (this.config.caption && !this.config.navbar) {
    this.config.navbar = ['caption'];
  }

  // check config
  if (!options.container) {
    throw new PSVError('No value given for container.');
  }

  if ((!PhotoSphereViewer.SYSTEM.isWebGLSupported || !this.config.webgl) && !PSVUtils.checkTHREE('CanvasRenderer', 'Projector')) {
    throw new PSVError('Missing Three.js components: CanvasRenderer, Projector. Get them from threejs-examples package.');
  }

  if (this.config.transition && this.config.transition.blur) {
    if (!PhotoSphereViewer.SYSTEM.isWebGLSupported || !this.config.webgl) {
      this.config.transition.blur = false;
      console.warn('PhotoSphereViewer: Using canvas rendering, blur transition disabled.');
    }
    else if (!PSVUtils.checkTHREE('EffectComposer', 'RenderPass', 'ShaderPass', 'MaskPass', 'CopyShader')) {
      throw new PSVError('Missing Three.js components: EffectComposer, RenderPass, ShaderPass, MaskPass, CopyShader. Get them from threejs-examples package.');
    }
  }

  if (this.config.max_fov < this.config.min_fov) {
    throw new PSVError('max_fov cannot be lower than min_fov.');
  }

  if (this.config.tilt_up_max < this.config.tilt_down_max) {
    throw new PSVError('tilt_up_max cannot be lower than tilt_down_max.');
  }

  // references to components
  this.parent = (typeof this.config.container == 'string') ? document.getElementById(this.config.container) : this.config.container;
  this.container = null;
  this.loader = null;
  this.navbar = null;
  this.hud = null;
  this.panel = null;
  this.tooltip = null;
  this.canvas_container = null;
  this.renderer = null;
  this.composer = null;
  this.passes = {};
  this.scene = null;
  this.camera = null;
  this.mesh = null;
  this.raycaster = null;
  this.doControls = null;
  this.actions = {};

  // local properties
  this.prop = {
    latitude: 0, // current latitude of the center
    longitude: 0, // current longitude of the center
    anim_speed: 0, // parsed anim speed (rad/sec)
    zoom_lvl: 0, // current zoom level
    moving: false, // is the user moving
    zooming: false, // is the user zooming
    start_mouse_x: 0, // start x position of the click/touch
    start_mouse_y: 0, // start y position of the click/touch
    mouse_x: 0, // current x position of the cursor
    mouse_y: 0, // current y position of the cursor
    mouse_history: [], // list of latest positions of the cursor [time, x, y]
    pinch_dist: 0, // distance between fingers when zooming
    direction: null, // direction of the camera (Vector3)
    orientation_reqid: null, // animationRequest id of the device orientation
    autorotate_reqid: null, // animationRequest id of the automatic rotation
    animation_promise: null, // promise of the current animation (either go to position or image transition)
    start_timeout: null, // timeout id of the automatic rotation delay
    boundingRect: null, // DOMRect of the container
    size: { // size of the container
      width: 0,
      height: 0
    },
    pano_data: { // panorama metadata
      full_width: 0,
      full_height: 0,
      cropped_width: 0,
      cropped_height: 0,
      cropped_x: 0,
      cropped_y: 0
    }
  };

  // compute zoom level
  this.prop.zoom_lvl = Math.round((this.config.default_fov - this.config.min_fov) / (this.config.max_fov - this.config.min_fov) * 100);
  this.prop.zoom_lvl -= 2 * (this.prop.zoom_lvl - 50);

  // create actual container
  this.container = document.createElement('div');
  this.container.classList.add('psv-container');
  this.parent.appendChild(this.container);

  // is canvas supported?
  if (!PhotoSphereViewer.SYSTEM.isCanvasSupported) {
    this.container.textContent = 'Canvas is not supported, update your browser!';
    throw new PSVError('Canvas is not supported.');
  }

  // init
  this.rotate({
    longitude: this.config.default_long,
    latitude: this.config.default_lat
  });

  if (this.config.size !== null) {
    this._setViewerSize(this.config.size);
  }

  if (this.config.autoload) {
    this.load();
  }
}

/**
 * Number of pixels bellow which a mouse move will be considered as a click
 * @type (int)
 */
PhotoSphereViewer.MOVE_THRESHOLD = 4;

/**
 * Time size of the mouse position history used to compute inertia
 * @type (int)
 */
PhotoSphereViewer.INERTIA_WINDOW = 300;

/**
 * SVG icons sources
 * @type (Object)
 */
PhotoSphereViewer.ICONS = {};

/**
 * System properties
 * @type (Object)
 */
PhotoSphereViewer.SYSTEM = {
  loaded: false,
  isWebGLSupported: false,
  isCanvasSupported: false,
  deviceOrientationSupported: null,
  maxTextureWidth: 0,
  mouseWheelEvent: null,
  fullscreenEvent: null
};

/**
 * PhotoSphereViewer defaults
 * @type (Object)
 */
PhotoSphereViewer.DEFAULTS = {
  panorama: null,
  container: null,
  caption: null,
  autoload: true,
  usexmpdata: true,
  pano_data: null,
  webgl: true,
  min_fov: 30,
  max_fov: 90,
  default_fov: null,
  default_long: 0,
  default_lat: 0,
  tilt_up_max: PSVUtils.HalfPI,
  tilt_down_max: -PSVUtils.HalfPI,
  long_offset: Math.PI / 1440.0,
  lat_offset: Math.PI / 720.0,
  time_anim: 2000,
  anim_speed: '2rpm',
  anim_lat: null,
  navbar: [
    'autorotate',
    'zoom',
    'download',
    'markers',
    'caption',
    'gyroscope',
    'fullscreen'
  ],
  tooltip: {
    offset: 5,
    arrow_size: 7,
    delay: 100
  },
  lang: {
    autorotate: 'Automatic rotation',
    zoom: 'Zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    download: 'Download',
    fullscreen: 'Fullscreen',
    markers: 'Markers',
    gyroscope: 'Gyroscope'
  },
  mousewheel: true,
  mousemove: true,
  move_inertia: true,
  click_event_on_marker: true,
  transition: {
    duration: 1500,
    loader: true,
    blur: false
  },
  loading_img: null,
  loading_txt: 'Loading...',
  size: null,
  markers: []
};

PhotoSphereViewer.Utils = PSVUtils;
PhotoSphereViewer.Error = PSVError;
