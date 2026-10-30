type Insets = { top: number; bottom: number; left: number; right: number };

export function workspaceLayout(width: number, height: number, fontScale = 1) {
  const sidebarWidth = width >= 1100 ? 248 : 208;
  const expanded =
    width >= Math.max(760, sidebarWidth + 480 * Math.max(1, fontScale)) && height >= 520;
  return {
    expanded,
    sidebarWidth: expanded ? sidebarWidth : 0,
    contentWidth: width - (expanded ? sidebarWidth : 0),
  };
}

/** Use the current window, including split-screen resizing, rather than device type. */
export function playerLayout(width: number, height: number, insets: Insets, fontScale = 1) {
  const padding = width >= 900 ? 40 : 29;
  const contentWidth = Math.max(
    0,
    Math.min(1440, width - insets.left - insets.right - padding * 2),
  );
  const split = width > height && contentWidth >= 600;
  const gap = split ? Math.min(64, Math.max(24, contentWidth * 0.05)) : 0;
  const primaryWidth = split
    ? Math.min(520, Math.max(260, (contentWidth - gap) * 0.44))
    : Math.min(600, contentWidth);
  const availableHeight = height - insets.top - insets.bottom - 84;
  const artworkSize = split
    ? Math.max(96, Math.min(primaryWidth, availableHeight - 280 * Math.max(1, fontScale)))
    : Math.max(
        96,
        Math.min(
          primaryWidth,
          height * 0.43,
          height - insets.top - insets.bottom - 350,
          width >= 600 ? 520 : 390,
        ),
      );
  return {
    padding,
    contentWidth,
    split,
    gap,
    primaryWidth,
    artworkSize,
    compact: availableHeight < 480 * Math.max(1, fontScale),
  };
}

export function libraryGrid(width: number, albums: boolean, spacious = false) {
  let gap: 32 | 24 | 8;
  if (spacious) {
    gap = 32;
  } else if (width >= 700) {
    gap = 24;
  } else {
    gap = 8;
  }

  const contentWidth = Math.max(0, width - 44);
  const columns = albums
    ? Math.max(2, Math.min(8, Math.floor((contentWidth + gap) / (180 + gap))))
    : Math.max(1, Math.min(3, Math.floor((contentWidth + gap) / (400 + gap))));
  return { columns, gap, itemWidth: Math.max(0, (contentWidth - gap * (columns - 1)) / columns) };
}
