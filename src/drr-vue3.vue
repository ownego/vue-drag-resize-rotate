<template>
  <div class="drr" :style="style" :class="classObject" @dblclick="dblclick($event)" @mousedown="bodyMouseDown($event)"
    @touchstart.stop.prevent="bodyMouseDown($event)">
    <slot></slot>
    <div v-for="stick in sticks" :key="stick" class="drr-stick"
      :class="['drr-stick-' + stick, resizable ? '' : 'not-resizable']"
      @mousedown.stop.prevent="stickDown(stick, $event)" @touchstart.stop.prevent="stickDown(stick, $event)"
      :style="drrStick(stick)">
    </div>
    <div v-if="rotatable" class="ro-stick-handle"></div>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  watch,
  useSlots,
  onMounted,
  getCurrentInstance,
  onBeforeUnmount,
} from 'vue';
import Vector from '@minogin/vector';

const stickSize = 8;
const roStickSize = 20;
const styleMapping = {
  y: {
    t: 'top',
    m: 'marginTop',
    b: 'bottom',
  },
  x: {
    l: 'left',
    m: 'marginLeft',
    r: 'right',
  },
};

const emit = defineEmits([
  'select',
  'deselect',
  'rotatestart',
  'rotate',
  'rotatestop',
  'resizestart',
  'resize',
  'resizestop',
  'update:x',
  'update:y',
  'update:w',
  'update:h',
  'update:angle',
  'content-active',
]);

const props = defineProps({
  x: {
    type: Number,
    required: true,
    validator: function (val) {
      return typeof val === 'number';
    },
  },
  y: {
    type: Number,
    required: true,
    validator: function (val) {
      return typeof val === 'number';
    },
  },
  w: {
    type: Number,
    required: true,
    validator: function (val) {
      return val > 0;
    },
  },
  h: {
    type: Number,
    required: true,
    validator: function (val) {
      return val > 0;
    },
  },
  angle: {
    type: Number,
    default: 0,
    validator: function (val) {
      return typeof val === 'number';
    },
  },
  selected: {
    type: Boolean,
    default: false,
  },
  selectable: {
    type: Boolean,
    default: true,
  },
  draggable: {
    type: Boolean,
    default: true,
  },
  resizable: {
    type: Boolean,
    default: true,
  },
  rotatable: {
    type: Boolean,
    default: true,
  },
  hasActiveContent: {
    type: Boolean,
    default: false,
  },
  aspectRatio: {
    type: Boolean,
    default: false,
  },
  dragHandle: {
    type: String,
    default: null,
  },
  dragCancel: {
    type: String,
    default: null,
  },
  outerBound: {
    type: Object,
  },
  innerBound: {
    type: Object,
  },
  dragHandler: {
    type: Function,
  },
  resizeHandler: {
    type: Function,
  },
  arrowStep: {
    type: Number,
    default: 1,
  },
});

const getDefaultStickStartPos = () => ({
  mouseX: 0,
  mouseY: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  cx: 0,
  cy: 0,
  width: 0,
  height: 0,
  rotation: 0,
});

const slots = useSlots();
const active = ref(props.selected);
const contentActive = ref(false);
const cx = ref(props.x);
const cy = ref(props.y);
const width = ref(props.w);
const height = ref(props.h);
const rotation = ref(props.angle);
const stickDrag = ref(false);
const bodyDrag = ref(false);
const dragged = ref(false);
const resized = ref(false);
const rotated = ref(false);
const currentStick = ref([]);
const stickStartPos = ref(getDefaultStickStartPos());
const startRect = ref(null);
const parentElement = ref(null);
const rotateStartEmitted = ref(false);
const resizeStartEmitted = ref(false);
const dragStartEmitted = ref(false);

const sticks = computed(() => {
  let sticks = [];

  if (props.resizable) {
    sticks.push('tl', 'tr', 'br', 'bl');
  }

  if (props.rotatable) {
    sticks.push('ro');
  }

  return sticks;
});

const classObject = computed(() => ({
  'active': active.value,
  'inactive': !active.value,
  'selectable': props.selectable,
  'non-selectable': !props.selectable,
  'dragging': bodyDrag.value,
  'content-active': contentActive.value,
}));

const style = computed(() => ({
  left: (cx.value - width.value / 2) + 'px',
  top: (cy.value - height.value / 2) + 'px',
  width: width.value + 'px',
  height: height.value + 'px',
  transform: 'rotate(' + rotation.value + 'deg)',
}));

const drrStick = computed(() => (stick) => {
  const stickStyle = {
    width: `${stickSize}px`,
    height: `${stickSize}px`,
  };

  if (stick == 'ro') {
    stickStyle['top'] = `${-stickSize / 2 - roStickSize}px`;
    stickStyle['marginLeft'] = `${-stickSize / 2 + 1}px`;
  } else {
    stickStyle[styleMapping.y[stick[0]]] = `${-stickSize / 2}px`;
    stickStyle[styleMapping.x[stick[1]]] = `${-stickSize / 2}px`;
  }

  return stickStyle;
});

watch(active, (val) => { emit(val ? 'select' : 'deselect'); });

watch(() => props.selected, (val) => { active.value = !!val; });

watch(
  () => props.hasActiveContent,
  (val) => {
    if (!val && contentActive.value) {
      onContentInactive();
    }
  },
  { immediate: true },
);

watch(() => props.x, (val) => {
  if (stickDrag.value || bodyDrag.value) {
    return;
  }

  cx.value = val;
});

watch(() => props.y, (val) => {
  if (stickDrag.value || bodyDrag.value) {
    return;
  }

  cy.value = val;
});

watch(() => props.w, () => {
  if (stickDrag.value || bodyDrag.value) {
    return;
  }

  currentStick.value = ['m', 'r'];
  width.value = props.w;
});

watch(() => props.h, () => {
  if (stickDrag.value || bodyDrag.value) {
    return;
  }

  currentStick.value = ['b', 'm'];

  height.value = props.h;
});

watch(() => props.angle, () => {
  if (stickDrag.value || bodyDrag.value) {
    return;
  }

  rotation.value = props.angle;
});

function onContentInactive() {
  if (!props.hasActiveContent) {
    return;
  }

  contentActive.value = false;
  active.value = true;

  /**
   * @type {import('vue').VNode[]} children
   */
  const children = slots.default();

  for (const child of children) {
    child.component.emit('inactive');
  }
};

function onContentActive() {
  if (!props.hasActiveContent) {
    return;
  }

  contentActive.value = true;
  active.value = false;

  /**
   * @type {import('vue').VNode[]} children
   */
  const children = slots.default();

  for (const child of children) {
    child.component.emit('active');
  }
};

function stickMove(ev) {
  let delta = new Vector(
    (ev.pageX || ev.touches[0].pageX) - stickStartPos.value.mouseX,
    (ev.pageY || ev.touches[0].pageY) - stickStartPos.value.mouseY,
  );

  if (currentStick.value[0] === 'ro') {
    let up = new Vector(0, -(height.value) / 2 - roStickSize);
    let rotationRad = Vector.rad(stickStartPos.value.rotation);
    up = up.rotate(rotationRad);
    let v = up.add(delta);

    if (!rotateStartEmitted.value) {
      emit('rotatestart', startRect.value);
      rotateStartEmitted.value = true;
    }

    rotation.value = Vector.deg(v.angle()) + 90;
    rotated.value = true;
    emit('rotate', getRect());
  } else {
    let dirX = currentStick.value[1] === 'r' ? 1 : -1;
    let dirY = currentStick.value[0] === 'b' ? 1 : -1;

    let phi = Vector.rad(stickStartPos.value.rotation ?? 0);
    let p;
    if (props.aspectRatio) {
      let axis = new Vector(
        dirX * stickStartPos.value.width / 2,
        dirY * stickStartPos.value.height / 2,
      );
      axis = axis.rotate(phi).unit();
      p = axis.mul(axis.mul(delta));
    } else {
      p = delta;
    }

    let pn = p.rotate(-phi);

    let newcx = stickStartPos.value.cx + p.x / 2;
    let newcy = stickStartPos.value.cy + p.y / 2;
    let newwidth = stickStartPos.value.width + dirX * pn.x;
    let newheight = stickStartPos.value.height + dirY * pn.y;
    let x1 = newcx - newwidth / 2;
    let y1 = newcy - newheight / 2;
    let x2 = newcx + newwidth / 2;
    let y2 = newcy + newheight / 2;

    if (props.outerBound && rotation.value == 0) {
      let bx1 = props.outerBound.x - props.outerBound.w / 2;
      let by1 = props.outerBound.y - props.outerBound.h / 2;
      let bx2 = props.outerBound.x + props.outerBound.w / 2;
      let by2 = props.outerBound.y + props.outerBound.h / 2;
      let dx = 0;
      let dy = 0;
      if (x1 < bx1)
        dx = bx1 - x1;
      if (x2 > bx2)
        dx = bx2 - x2;
      if (y1 < by1)
        dy = by1 - y1;
      if (y2 > by2)
        dy = by2 - y2;

      if (dx != 0 || dy != 0) {
        if (props.aspectRatio) {
          if (dx / p.x < dy / p.y) {
            p.y += dx * p.y / p.x;
            p.x += dx;
          }
          else {
            p.x += dy * p.x / p.y;
            p.y += dy;
          }
        }
        else {
          p.x += dx;
          p.y += dy;
        }
      }
    }

    if (props.innerBound && rotation.value == 0) {
      let bx1 = props.innerBound.x - props.innerBound.w / 2;
      let by1 = props.innerBound.y - props.innerBound.h / 2;
      let bx2 = props.innerBound.x + props.innerBound.w / 2;
      let by2 = props.innerBound.y + props.innerBound.h / 2;
      let dx = 0;
      let dy = 0;
      if (x1 > bx1) {
        dx = bx1 - x1;
      }

      if (x2 < bx2) {
        dx = bx2 - x2;
      }

      if (y1 > by1) {
        dy = by1 - y1;
      }

      if (y2 < by2) {
        dy = by2 - y2;
      }

      if (dx != 0 || dy != 0) {
        if (props.aspectRatio) {
          if (dx / p.x < dy / p.y) {
            p.y += dx * p.y / p.x;
            p.x += dx;
          } else {
            p.x += dy * p.x / p.y;
            p.y += dy;
          }
        } else {
          p.x += dx;
          p.y += dy;
        }
      }
    }

    cx.value = stickStartPos.value.cx + p.x / 2;
    cy.value = stickStartPos.value.cy + p.y / 2;
    pn = p.rotate(-phi);
    width.value = stickStartPos.value.width + dirX * pn.x;
    height.value = stickStartPos.value.height + dirY * pn.y;

    if (props.resizeHandler) {
      setRect(props.resizeHandler(getRect()));
    }

    if (!resizeStartEmitted.value) {
      emit('resizestart', startRect.value);
      resizeStartEmitted.value = true;
    }

    resized.value = true;
    emit('resize', getRect());
  }
};

function bodyMove(ev) {
  const newPos = {
    mouseX: ev.pageX || ev.touches[0].pageX,
    mouseY: ev.pageY || ev.touches[0].pageY,
  };
  const delta = {
    x: newPos.mouseX - stickStartPos.value.mouseX,
    y: newPos.mouseY - stickStartPos.value.mouseY,
  };

  let newcx = stickStartPos.value.cx + delta.x;
  let newcy = stickStartPos.value.cy + delta.y;
  let x1 = newcx - width.value / 2;
  let y1 = newcy - height.value / 2;
  let x2 = newcx + width.value / 2;
  let y2 = newcy + height.value / 2;

  if (props.outerBound && rotation.value == 0) {
    let bx1 = props.outerBound.x - props.outerBound.w / 2;
    let by1 = props.outerBound.y - props.outerBound.h / 2;
    let bx2 = props.outerBound.x + props.outerBound.w / 2;
    let by2 = props.outerBound.y + props.outerBound.h / 2;
    if (x1 < bx1)
      delta.x -= x1 - bx1;
    if (x2 > bx2)
      delta.x -= x2 - bx2;
    if (y1 < by1)
      delta.y -= y1 - by1;
    if (y2 > by2)
      delta.y -= y2 - by2;
  }

  if (props.innerBound && rotation.value == 0) {
    let bx1 = props.innerBound.x - props.innerBound.w / 2;
    let by1 = props.innerBound.y - props.innerBound.h / 2;
    let bx2 = props.innerBound.x + props.innerBound.w / 2;
    let by2 = props.innerBound.y + props.innerBound.h / 2;

    if (x1 > bx1) {
      delta.x -= x1 - bx1;
    }

    if (x2 < bx2) {
      delta.x -= x2 - bx2;
    }

    if (y1 > by1) {
      delta.y -= y1 - by1;
    }

    if (y2 < by2) {
      delta.y -= y2 - by2;
    }
  }

  cx.value = stickStartPos.value.cx + delta.x;
  cy.value = stickStartPos.value.cy + delta.y;

  if (props.dragHandler)
    setRect(props.dragHandler(getRect(), ev));

  if (!dragStartEmitted.value) {
    emit('dragstart', startRect.value);
    dragStartEmitted.value = true;
  }

  dragged.value = true;
  emit('drag', getRect());
}

function move(ev) {
  if (!stickDrag.value && !bodyDrag.value) {
    return;
  }

  ev.stopPropagation();

  if (stickDrag.value) {
    stickMove(ev);
  }

  if (bodyDrag.value) {
    bodyMove(ev);
  }
};

function stickUp() {
  stickDrag.value = false;
  stickStartPos.value = getDefaultStickStartPos();

  if (resized.value) {
    emit('resizestop', getRect(), startRect.value);  // TODO
    emit('change', getRect());
  }

  if (rotated.value) {
    emit('rotatestop', getRect(), startRect.value);
    emit('change', getRect());
  }
}

function bodyUp() {
  bodyDrag.value = false;

  if (dragged.value) {
    emit('dragstop', getRect(), startRect.value);
    emit('change', getRect());
  }

  stickStartPos.value = getDefaultStickStartPos();
}

function up(ev) {
  if (stickDrag.value) {
    stickUp(ev);
  }

  if (bodyDrag.value) {
    bodyUp(ev);
  }
};

function getRect() {
  return {
    x: cx.value,
    y: cy.value,
    w: width.value,
    h: height.value,
    angle: rotation.value,
  };
}

function setRect(r) {
  emit('update:x', r.x);
  emit('update:y', r.y);
  emit('update:w', r.w);
  emit('udpate:h', r.h);
  emit('update.angle', r.angle);
}

function deselect() {
  emit('deselect');
  active.value = false;
}

function arrowMove(rect) {
  setRect(rect);
  emit('drag', rect);
  emit('dragstop', rect);
};

function keyboardEvent(event) {
  if (!active.value) {
    return;
  }

  let rect = getRect();

  switch (event.keyCode) {
    case 37:
      rect = {
        ...rect,
        x: rect.x - props.arrowStep,
      };
      event.preventDefault();
      event.stopPropagation();
      arrowMove(rect);
      break;
    case 38:
      rect = {
        ...rect,
        y: rect.y - props.arrowStep,
      };
      event.preventDefault();
      event.stopPropagation();
      arrowMove(rect);
      break;
    case 39:
      rect = {
        ...rect,
        x: rect.x + props.arrowStep,
      };
      event.preventDefault();
      event.stopPropagation();
      arrowMove(rect);
      break;
    case 40:
      rect = {
        ...rect,
        y: rect.y + props.arrowStep,
      };
      event.preventDefault();
      event.stopPropagation();
      arrowMove(rect);
      break;
    default:
      break;
  }
}

function getElement() {
  return getCurrentInstance().proxy.$el;
}

function getUID() {
  return getCurrentInstance().uid;
}

function dblclick() {
  if (!props.selectable) {
    return;
  }

  emit('content-active');
  onContentActive();
}

function bodyMouseDown(e) {
  if (contentActive.value || !props.selectable) {
    return;
  } else {
    e.preventDefault();
    e.stopPropagation();
  }

  let target = e.target || e.srcElement;

  active.value = true;

  if (e.button && e.button !== 0) {
    return;
  }

  emit('clicked', e);

  if (!props.draggable || !active.value) {
    return;
  }

  if (props.dragHandle && target.getAttribute('data-drag-handle') !== getUID().toString()) {
    return;
  }

  if (props.dragCancel && target.getAttribute('data-drag-cancel') === getUID().toString()) {
    return;
  }

  bodyDrag.value = true;
  dragged.value = false;

  dragStartEmitted.value = false;
  startRect.value = { ...getRect() };

  stickStartPos.value.mouseX = e.pageX || e.touches[0].pageX;
  stickStartPos.value.mouseY = e.pageY || e.touches[0].pageY;

  stickStartPos.value.cx = cx.value;
  stickStartPos.value.cy = cy.value;
};

function stickDown(stick, ev) {
  if (!props.resizable || !active.value)
    return;

  resizeStartEmitted.value = false;
  rotateStartEmitted.value = false;
  startRect.value = { ...getRect() };

  stickDrag.value = true;
  resized.value = false;
  rotated.value = false;
  stickStartPos.value.mouseX = ev.pageX || ev.touches[0].pageX;
  stickStartPos.value.mouseY = ev.pageY || ev.touches[0].pageY;
  stickStartPos.value.cx = cx.value;
  stickStartPos.value.cy = cy.value;
  stickStartPos.value.width = width.value;
  stickStartPos.value.height = height.value;
  stickStartPos.value.rotation = rotation.value;
  currentStick.value = [stick];
}

onMounted(() => {
  const el = getElement();
  parentElement.value = el.parentElement;

  document.documentElement.addEventListener('mousemove', move);
  document.documentElement.addEventListener('mouseup', up);
  document.documentElement.addEventListener('mouseleave', up);

  document.documentElement.addEventListener('mousedown', deselect);

  document.documentElement.addEventListener('touchmove', move, true);
  document.documentElement.addEventListener('touchend touchcancel', up, true);
  document.documentElement.addEventListener('touchstart', up, true);
  document.addEventListener('keydown', keyboardEvent);

  if (props.dragHandle) {
    let dragHandles = Array.prototype.slice.call(el.querySelectorAll(props.dragHandle));
    for (let i in dragHandles) {
      dragHandles[i].setAttribute('data-drag-handle', getUID());
    }
  }

  if (props.dragCancel) {
    let cancelHandles = Array.prototype.slice.call(el.querySelectorAll(props.dragCancel));
    for (let i in cancelHandles) {
      cancelHandles[i].setAttribute('data-drag-cancel', getUID());
    }
  }
});


onBeforeUnmount(() => {
  document.documentElement.removeEventListener('mousemove', move);
  document.documentElement.removeEventListener('mouseup', up);
  document.documentElement.removeEventListener('mouseleave', up);

  document.documentElement.removeEventListener('mousedown', deselect);

  document.documentElement.removeEventListener('touchmove', move, true);
  document.documentElement.removeEventListener('touchend touchcancel', up, true);
  document.documentElement.removeEventListener('touchstart', up, true);
  document.removeEventListener('keydown', keyboardEvent);
});
</script>

<style scoped>
/*TODO less */

.drr {
  position: absolute;
  box-sizing: border-box;
  cursor: pointer;
}

.drr.active:before {
  content: '';
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  outline: 2px dashed lightskyblue;
}

.drr.selectable.inactive:hover:before {
  content: '';
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  outline: 2px dashed #d6d6d6;
}

.drr.non-selectable {
  pointer-events: none;
}

.drr-stick {
  box-sizing: border-box;
  position: absolute;
  font-size: 1px;
  background: #ffffff;
  border: 1px solid #6c6c6c;
  box-shadow: 0 0 2px #bbb;
}

.drr-stick:hover {
  border-color: lightskyblue;
}

.inactive>.drr-stick {
  display: none;
}

.drr-stick-tl,
.drr-stick-br {
  cursor: nwse-resize;
}

.drr-stick-tm,
.drr-stick-bm {
  left: 50%;
  cursor: ns-resize;
}

.drr-stick-tr,
.drr-stick-bl {
  cursor: nesw-resize;
}

.drr-stick-ml,
.drr-stick-mr {
  top: 50%;
  cursor: ew-resize;
}

.drr-stick-ro {
  left: 50%;
  cursor: ew-resize;
  border-radius: 4px;
}

.ro-stick-handle {
  left: 50%;
  top: -16px;
  box-sizing: border-box;
  position: absolute;
  font-size: 1px;
  background: #ffffff;
  border: 1px solid #6c6c6c;
  box-shadow: 0 0 2px #bbb;
  width: 0px;
  height: 16px;
}

.inactive>.ro-stick-handle {
  display: none;
}

.drr-stick.not-resizable {
  display: none;
}

.content-active {
  border: 2px solid lightskyblue;
  /*TODO*/
}
</style>
