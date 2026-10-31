// 证件照规格常量（300 DPI）与目标大小档位
const PHOTO_SPECS = [
  { id: 'small1', label: '小一寸', width: 260, height: 378, desc: '22×32mm' },
  { id: 'one',    label: '一寸',   width: 295, height: 413, desc: '25×35mm' },
  { id: 'big1',   label: '大一寸', width: 390, height: 567, desc: '33×48mm' },
  { id: 'two',    label: '二寸',   width: 413, height: 579, desc: '35×49mm' },
];

// 常用目标大小档位（单位 KB），1M = 1024KB
const SIZE_PRESETS = [30, 50, 64, 100, 200, 500, 1024];
