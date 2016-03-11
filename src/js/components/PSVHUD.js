/**
 * HUD class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVHUD(psv) {
  PSVComponent.call(this, psv);

  this.$svg = null;
  this.markers = {};
  this.currentMarker = null;
  this.hoveringMarker = null;

  this.create();
}

PSVHUD.prototype = Object.create(PSVComponent.prototype);
PSVHUD.prototype.constructor = PSVHUD;

PSVHUD.className = 'psv-hud';
PSVHUD.publicMethods = ['addMarker', 'removeMarker', 'updateMarker', 'getMarker', 'getCurrentMarker', 'gotoMarker', 'hideMarker', 'showMarker', 'toggleMarker', 'resetMarkers'];

PSVHUD.svgNS = 'http://www.w3.org/2000/svg';

/**
 * Creates the HUD
 * @return (void)
 */
PSVHUD.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.$svg = document.createElementNS(PSVHUD.svgNS, 'svg');
  this.$svg.setAttribute('class', 'psv-svg-container');
  this.container.appendChild(this.$svg);

  // Markers events via delegation
  this.container.addEventListener('mouseenter', this, true);
  this.container.addEventListener('mouseleave', this, true);
  this.container.addEventListener('mousemove', this, true);

  // Viewer events
  this.psv.on('_click', this);
  this.psv.on('render', this);
};

/**
 * Destroys the HUD
 */
PSVHUD.prototype.destroy = function() {
  this.container.removeEventListener('mouseenter', this);
  this.container.removeEventListener('mouseleave', this);
  this.container.removeEventListener('mousemove', this);

  this.psv.off('_click', this);
  this.psv.off('render', this);

  this.container.removeChild(this.$svg);
  this.$svg = null;

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVHUD.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mouseenter': this._onMouseEnter(e);    break;
    case 'mouseleave': this._onMouseLeave(e);    break;
    case 'mousemove':  this._onMouseMove(e);     break;
    case 'psv:_click': this._onClick(e.args[0]); break;
    case 'psv:render': this.updatePositions();   break;
    // @formatter:on
  }
};

/**
 * Add a new marker to HUD
 * @param marker (Object)
 * @param render (Boolean) "false" to disable immediate render
 * @return (Object) a modified marker object
 */
PSVHUD.prototype.addMarker = function(marker, render) {
  if (!marker.id) {
    throw new PSVError('missing marker id');
  }

  if (this.markers[marker.id]) {
    throw new PSVError('marker "' + marker.id + '" already exists');
  }

  if (!marker.image && !marker.html && !marker.polygon_px && !marker.polygon_rad) {
    throw new PSVError('missing marker content, image or html or polygon');
  }

  if (marker.image && (!marker.width || !marker.height)) {
    throw new PSVError('missing marker width/height');
  }

  if (marker.image || marker.html) {
    if ((!marker.hasOwnProperty('x') || !marker.hasOwnProperty('y')) && (!marker.hasOwnProperty('latitude') || !marker.hasOwnProperty('longitude'))) {
      throw new PSVError('missing marker position, latitude/longitude or x/y');
    }
  }

  // temporary object replaced by updateMarker()
  var temp = {
    id: marker.id,
    $el: null
  };

  // create DOM
  if (marker.image || marker.html) {
    temp.$el = document.createElement('div');
    temp.$el.setAttribute('class', 'psv-marker');
    this.container.appendChild(temp.$el);
  }
  else {
    temp.$el = document.createElementNS(PSVHUD.svgNS, 'polygon');
    temp.$el.setAttribute('class', 'psv-marker svg-marker');
    this.$svg.appendChild(temp.$el);
  }

  temp.$el.id = 'psv-marker-' + temp.id;

  this.markers[marker.id] = temp;

  return this.updateMarker(marker, render);
};

/**
 * Get a marker by it's id or external object
 * @param marker (Mixed)
 * @return (Object)
 */
PSVHUD.prototype.getMarker = function(marker) {
  var id = typeof marker === 'object' ? marker.id : marker;

  if (!this.markers[id]) {
    throw new PSVError('cannot find marker "' + id + '"');
  }

  return this.markers[id];
};

/**
 * Get the current selected marker
 * @return (Object)
 */
PSVHUD.prototype.getCurrentMarker = function() {
  return this.currentMarker;
};

/**
 * Update a marker
 * @param marker (Object)
 * @param render (Boolean) "false" to disable immediate render
 * @return (Object) a modified marker object
 */
PSVHUD.prototype.updateMarker = function(marker, render) {
  var old = this.getMarker(marker);

  // clean some previous data
  if (old.className) {
    old.$el.classList.remove(old.className);
  }
  if (old.tooltip) {
    old.$el.classList.remove('has-tooltip');
  }

  // merge objects
  if (marker == old) marker = PSVUtils.clone(marker);
  delete marker.$el;
  marker = PSVUtils.deepmerge(old, marker);

  marker.position2D = null;

  // add classes
  if (marker.className) {
    marker.$el.classList.add(marker.className);
  }
  if (marker.tooltip) {
    marker.$el.classList.add('has-tooltip');
    if (typeof marker.tooltip === 'string') {
      marker.tooltip = { content: marker.tooltip };
    }
  }

  if (marker.image || marker.html) {
    this._updateNormalMarker(marker);
  }
  else {
    this._updatePolygonMarker(marker);
  }

  if (!marker.hasOwnProperty('visible')) {
    marker.visible = true;
  }

  // save
  marker.$el.psvMarker = marker;
  this.markers[marker.id] = marker;

  if (render !== false) {
    this.updatePositions();
  }

  return marker;
};

/**
 * Update a marker of type point
 * @param marker
 * @private
 */
PSVHUD.prototype._updateNormalMarker = function(marker) {
  marker.isPolygon = false;

  // set image
  var style = marker.$el.style;

  if (marker.width && marker.height) {
    style.width = marker.width + 'px';
    style.height = marker.height + 'px';
    marker.dynamicSize = false;
  }
  else {
    marker.dynamicSize = true;
  }

  if (marker.style) {
    Object.getOwnPropertyNames(marker.style).forEach(function(prop) {
      style[prop] = marker.style[prop];
    });
  }

  if (marker.image) {
    style.backgroundImage = 'url(' + marker.image + ')';
  }
  else {
    marker.$el.innerHTML = marker.html;
  }

  // parse anchor
  marker.anchor = PSVUtils.parsePosition(marker.anchor);
  style.transformOrigin = marker.anchor.left * 100 + '% ' + marker.anchor.top * 100 + '%';

  // convert texture coordinates to spherical coordinates
  this.psv._cleanPosition(marker);

  // compute x/y/z position
  marker.position3D = this.psv.sphericalCoordsToVector3(marker.longitude, marker.latitude);
};

/**
 * Update a marker of type polygon
 * @param marker
 * @private
 */
PSVHUD.prototype._updatePolygonMarker = function(marker) {
  marker.isPolygon = true;
  marker.dynamicSize = true;

  if (marker.style) {
    Object.getOwnPropertyNames(marker.style).forEach(function(prop) {
      marker.$el.setAttribute(prop, marker.style[prop]);
    });
  }
  else {
    marker.$el.setAttribute('fill', 'rgba(0,0,0,0.5)');
  }

  // fold arrays: [1,2,3,4] => [[1,2],[3,4]]
  [marker.polygon_rad, marker.polygon_px].forEach(function(polygon) {
    if (polygon && typeof polygon[0] != 'object') {
      for (var i = 0; i < polygon.length; i++) {
        polygon.splice(i, 2, [polygon[i], polygon[i + 1]]);
      }
    }
  });

  // convert texture coordinates to spherical coordinates
  if (marker.polygon_px) {
    marker.polygon_rad = marker.polygon_px.map(function(coord) {
      var sphericalCoords = this.psv.textureCoordsToSphericalCoords(coord[0], coord[1]);
      return [sphericalCoords.longitude, sphericalCoords.latitude];
    }, this);
  }
  else {
    marker.polygon_rad = marker.polygon_rad.map(function(coord) {
      return [
        PSVUtils.parseAngle(coord[0]),
        PSVUtils.stayBetween(PSVUtils.parseAngle(coord[1], -Math.PI), -PSVUtils.HalfPI, PSVUtils.HalfPI)
      ];
    });
  }

  // TODO : compute the center of the polygon
  marker.longitude = marker.polygon_rad[0][0];
  marker.latitude = marker.polygon_rad[0][1];

  // compute x/y/z positions
  marker.positions3D = marker.polygon_rad.map(function(coord) {
    return this.psv.sphericalCoordsToVector3(coord[0], coord[1]);
  }, this);
};

/**
 * Remove a marker
 * @param marker (Mixed)
 * @param render (Boolean) "false" to disable immediate render
 * @return (void)
 */
PSVHUD.prototype.removeMarker = function(marker, render) {
  marker = this.getMarker(marker);

  if (marker.isPolygon) {
    this.$svg.removeChild(marker.$el);
  }
  else {
    this.container.removeChild(marker.$el);
  }

  delete this.markers[marker.id];

  if (render !== false) {
    this.updatePositions();
  }
};

/**
 * Remove all markers
 * @param render (Boolean) "false" to disable immediate render
 */
PSVHUD.prototype.resetMarkers = function(render) {
  Object.keys(this.markers).forEach(function(marker) {
    this.removeMarker(marker, false)
  }, this);

  if (render !== false) {
    this.updatePositions();
  }
};

/**
 * Go to a specific marker
 * @param marker (Mixed)
 * @param duration (Mixed, optional)
 * @return (void)
 */
PSVHUD.prototype.gotoMarker = function(marker, duration) {
  marker = this.getMarker(marker);
  this.psv.animate(marker, duration);
};

/**
 * Hide a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.hideMarker = function(marker) {
  this.getMarker(marker).visible = false;
  this.updatePositions();
};

/**
 * Show a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.showMarker = function(marker) {
  this.getMarker(marker).visible = true;
  this.updatePositions();
};

/**
 * Toggle a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.toggleMarker = function(marker) {
  this.getMarker(marker).visible ^= true;
  this.updatePositions();
};

/**
 * Update visibility and position of all markers
 * @return (void)
 */
PSVHUD.prototype.updatePositions = function() {
  // FIXME: only when using gyroscope
  //var rotation = this.psv.camera.rotation.z / Math.PI * 180;
  var rotation = 0;

  for (var id in this.markers) {
    var marker = this.markers[id];

    if (marker.isPolygon) {
      var positions = this._getPolygonPositions(marker);

      if (this._isPolygonVisible(marker, positions)) {
        marker.position2D = this._getPolygonDimensions(positions);
        marker.width = marker.position2D.width;
        marker.height = marker.position2D.height;

        var points = '';
        positions.forEach(function(pos) {
          points += pos.left + ',' + pos.top + ' ';
        });

        marker.$el.setAttributeNS(null, 'points', points);

        if (!marker.$el.classList.contains('visible')) {
          marker.$el.classList.add('visible');
        }
      }
      else {
        marker.position2D = null;
        marker.$el.classList.remove('visible');
      }
    }
    else {
      var position = this._getMarkerPosition(marker);

      if (this._isMarkerVisible(marker, position)) {
        marker.position2D = position;

        marker.$el.style.transform = 'translate3D(' + position.left + 'px, ' + position.top + 'px, ' + '0px) rotateZ(' + rotation + 'deg)';

        if (!marker.$el.classList.contains('visible')) {
          marker.$el.classList.add('visible');
        }
      }
      else {
        marker.position2D = null;
        marker.$el.classList.remove('visible');
      }
    }
  }
};

/**
 * Determine if a point marker is visible
 * It tests if the point is in the general direction of the camera, then check if it's in the viewport
 * @param marker (Object)
 * @param position (Object)
 * @return (Boolean)
 */
PSVHUD.prototype._isMarkerVisible = function(marker, position) {
  return marker.visible &&
    marker.position3D.dot(this.psv.prop.direction) > 0 &&
    position.left + marker.width >= 0 &&
    position.left - marker.width <= this.psv.prop.size.width &&
    position.top + marker.height >= 0 &&
    position.top - marker.height <= this.psv.prop.size.height;
};

/**
 * Determine if a polygon marker is visible
 * It tests if at least one point is in teh viewport
 * @param marker (Object)
 * @param positions (Object[])
 * @returns (boolean)
 * @private
 */
PSVHUD.prototype._isPolygonVisible = function(marker, positions) {
  return marker.visible &&
    positions.some(function(pos, i) {
      return marker.positions3D[i].dot(this.psv.prop.direction) > 0 &&
        pos.left >= 0 &&
        pos.left <= this.psv.prop.size.width &&
        pos.top >= 0 &&
        pos.top <= this.psv.prop.size.height;
    }, this);
};

/**
 * Compute HUD coordinates of a marker
 * @param marker (Object)
 * @return (Object) top and left position
 */
PSVHUD.prototype._getMarkerPosition = function(marker) {
  if (marker.dynamicSize) {
    // make the marker visible to get it's size
    marker.$el.classList.add('transparent');
    var rect = marker.$el.getBoundingClientRect();
    marker.$el.classList.remove('transparent');

    marker.width = rect.right - rect.left;
    marker.height = rect.bottom - rect.top;
  }

  var vector = marker.position3D.clone();
  vector.project(this.psv.camera);

  return {
    top: (1 - vector.y) / 2 * this.psv.prop.size.height - marker.height * marker.anchor.top,
    left: (vector.x + 1) / 2 * this.psv.prop.size.width - marker.width * marker.anchor.left
  };
};

/**
 * Compute HUD coordinates of each point of a polygon
 * @param marker (Object)
 * @returns (Object[])
 * @private
 */
PSVHUD.prototype._getPolygonPositions = function(marker) {
  return marker.positions3D.map(function(pos) {
    var vector = pos.clone();
    vector.project(this.psv.camera);

    return {
      top: (1 - vector.y) / 2 * this.psv.prop.size.height,
      left: (vector.x + 1) / 2 * this.psv.prop.size.width
    };
  }, this);
};

/**
 * Compute the boundaries positions of a polygon marker
 * @param positions (Object[])
 * @returns (Object)
 * @private
 */
PSVHUD.prototype._getPolygonDimensions = function(positions) {
  var minX = +Infinity;
  var minY = +Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;

  positions.forEach(function(pos) {
    minX = Math.min(minX, pos.left);
    minY = Math.min(minY, pos.top);
    maxX = Math.max(maxX, pos.left);
    maxY = Math.max(maxY, pos.top);
  });

  return {
    top: minY,
    left: minX,
    width: maxX - minX,
    height: maxY - minY
  };
};

/**
 * The mouse enters a marker : show the tooltip
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onMouseEnter = function(e) {
  var marker;
  if (e.target && (marker = e.target.psvMarker) !== undefined && marker.tooltip && !marker.isPolygon) {
    this.hoveringMarker = marker;

    this.psv.tooltip.showTooltip({
      content: marker.tooltip.content,
      position: marker.tooltip.position,
      top: marker.position2D.top,
      left: marker.position2D.left,
      marker: marker
    });
  }
};

/**
 * The mouse leaves a marker : hide the tooltip
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onMouseLeave = function(e) {
  if (e.target && e.target.psvMarker) {
    // do not hide if we enter the tooltip while hovering a polygon
    if (e.target.psvMarker.isPolygon && e.relatedTarget && PSVUtils.hasParent(e.relatedTarget, this.psv.tooltip.container)) {
      return;
    }

    this.hoveringMarker = null;

    this.psv.tooltip.hideTooltip();
  }
};

/**
 * The mouse hovers a polygon marker, the tooltip follow the cursor.
 * @param e
 * @private
 */
PSVHUD.prototype._onMouseMove = function(e) {
  if (!this.psv.prop.moving) {
    var marker;
    // do not hide if we enter the tooltip while hovering a polygon
    if (e.target && (marker = e.target.psvMarker) && marker.tooltip && marker.isPolygon ||
      e.target && PSVUtils.hasParent(e.target, this.psv.tooltip.container) && (marker = this.hoveringMarker)) {

      this.hoveringMarker = marker;

      // simulate a marker with the size of the tooltip arrow to separate it from the cursor
      this.psv.tooltip.showTooltip({
        content: marker.tooltip.content,
        position: marker.tooltip.position,
        top: e.clientY - this.psv.prop.boundingRect.top - this.psv.config.tooltip.arrow_size,
        left: e.clientX - this.psv.prop.boundingRect.left - this.psv.config.tooltip.arrow_size,
        marker: {
          width: this.psv.config.tooltip.arrow_size * 2,
          height: this.psv.config.tooltip.arrow_size * 2
        }
      });
    }
    else if (this.hoveringMarker && this.hoveringMarker.isPolygon) {
      this.psv.tooltip.hideTooltip();
    }
  }
};

/**
 * The mouse button is release : show/hide the panel if threshold was not reached, or do nothing
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onClick = function(e) {
  var marker;
  if (e.target && (marker = PSVUtils.getClosest(e.target, '.psv-marker')) && marker.psvMarker) {
    this.currentMarker = marker.psvMarker;
    this.psv.trigger('select-marker', marker.psvMarker);

    if (this.psv.config.click_event_on_marker) {
      // add the marker to event data
      e.data = {
        marker: marker.psvMarker
      };
    }
    else {
      // prevent the public "click" event
      e.preventDefault();
    }
  }
  else if (this.currentMarker) {
    this.currentMarker = null;
    this.psv.trigger('unselect-marker');
  }

  if (marker && marker.psvMarker && marker.psvMarker.content) {
    this.psv.panel.showPanel(marker.psvMarker.content);
  }
  else if (this.psv.panel.prop.opened) {
    e.preventDefault(); // prevent the public "click" event
    this.psv.panel.hidePanel();
  }
};
