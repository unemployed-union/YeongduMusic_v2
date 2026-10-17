import type { BottomMenuId } from './menu-layout';

export function tabletTabInfo(route: { name: string; state?: { index?: number; routes: readonly { name: string; key?: string }[] } }) {
  const childRoute = route.state?.routes[route.state.index ?? 0];
  const child = childRoute?.name;
  const active: BottomMenuId = route.name === 'search' ? 'search' : route.name === '(playlists)' ? 'playlists' : 'library';
  const libraryHome = active === 'library' && (!child || child === 'index');
  const title = child === 'album/[id]' ? '앨범' : child === 'artist/[id]' ? '아티스트' : child === 'favorites' ? '좋아요'
    : active === 'search' ? '검색' : active === 'playlists' ? '플레이리스트' : '보관함';
  return { active, libraryHome, title, transitionKey: childRoute?.key ?? route.name + '/' + (child ?? '') };
}
