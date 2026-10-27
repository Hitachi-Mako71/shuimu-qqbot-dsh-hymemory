const valid = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);

// Keep the original controller as the primary owner while allowing explicit co-controllers.
export function groupControllers(room) {
  return [...new Set([room?.controller, ...(Array.isArray(room?.controllers) ? room.controllers : [])].filter(valid))];
}

export function groupHasController(room) {
  return groupControllers(room).length > 0;
}

export function hasGroupController(room, senderId) {
  return valid(senderId) && groupControllers(room).includes(senderId);
}
