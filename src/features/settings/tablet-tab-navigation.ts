import type { BottomMenuId } from './menu-layout';

export function tabletTabInfo(route: {
  name: string;
  state?: { index?: number; routes: readonly { name: string; key?: string }[] };
}) {
  const childRoute = route.state?.routes[route.state.index ?? 0];
  const child = childRoute?.name;
  let active: BottomMenuId;
  if (route.name === 'search') {
    active = 'search';
  } else if (route.name === '(playlists)') {
    active = 'playlists';
  } else {
    active = 'library';
  }

  const libraryHome = active === 'library' && (!child || child === 'index');
  let title: string;
  if (child === 'album/[id]') {
    title = '앨범';
  } else if (child === 'artist/[id]') {
    title = '아티스트';
  } else if (child === 'favorites') {
    title = '좋아요';
  } else if (active === 'search') {
    title = '검색';
  } else if (active === 'playlists') {
    title = '플레이리스트';
  } else {
    title = '보관함';
  }

  return {
    active,
    libraryHome,
    title,
    transitionKey: childRoute?.key ?? route.name + '/' + (child ?? ''),
  };
}
