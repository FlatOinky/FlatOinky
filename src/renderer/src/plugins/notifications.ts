// import type { OinkyPlugin } from '../../../types/OinkyPlugin';

// let idleTimeoutId: number | undefined;

// const clearIdleTimeout = () => {
//   if (idleTimeoutId) {
//     clearTimeout(idleTimeoutId);
//     idleTimeoutId = undefined;
//   }
// };

// export const notificationsPlugin: OinkyPlugin = {
//   id: 'core/notifications',
//   name: 'Notifications',
//   description: 'Creates desktop notifications for chosen events',
//   settings: [
//     { type: 'checkbox', id: 'desktop', name: 'Desktop Notification', default: true },
//     { type: 'checkbox', id: 'sounds', name: 'Sound Notification', default: false },
//     { type: 'divider' },
//     { type: 'checkbox', id: 'afk', name: 'Notify AFK', default: true },
//     {
//       type: 'checkbox',
//       id: 'afk/crafting',
//       name: 'Crafting is AFK',
//       description: 'Is only crafting considered AFK?',
//       default: false,
//     },
//     { type: 'divider' },
//     { type: 'checkbox', id: 'nest', name: 'Notify Nest Drops', default: true },
//     { type: 'divider' },
//     { type: 'checkbox', id: 'ground', name: 'Ground Treasures', default: false },
//   ],
//   setup: () => {
//     clearIdleTimeout();
//   },
//   cleanup: () => {
//     clearIdleTimeout();
//   },
//   update: () => {},
// };
