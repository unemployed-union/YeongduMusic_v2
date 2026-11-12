import type { FolderNode, FolderTreeRow } from './folder-tree';

export function parentFolderPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : '';
}

export function indexFolderTree(tree: readonly FolderNode[]): Map<string, FolderNode> {
  const index = new Map<string, FolderNode>();
  const pending = [...tree];
  while (pending.length) {
    const node = pending.pop()!;
    index.set(node.path, node);
    for (const child of node.children) {
      pending.push(child);
    }
  }
  return index;
}

// Browse immediate children. Search and explicit-selection filters span the library.
export function folderNavigationRows(
  tree: readonly FolderNode[],
  index: ReadonlyMap<string, FolderNode>,
  currentPath: string,
  selected: ReadonlySet<string>,
  term = '',
  selectedOnly = false,
): FolderTreeRow[] {
  const match = term.trim().normalize('NFKC').toLocaleLowerCase();
  const filtering = !!match || selectedOnly;
  let candidates = tree;
  if (filtering) {
    candidates = [...index.values()];
  } else if (currentPath) {
    candidates = index.get(currentPath)?.children ?? [];
  }

  return candidates
    .filter(
      (node) =>
        (!selectedOnly || selected.has(node.path)) &&
        node.path.normalize('NFKC').toLocaleLowerCase().includes(match),
    )
    .map((node) => {
      let ancestor = parentFolderPath(node.path);
      let coveredByParent = false;
      while (ancestor) {
        if (selected.has(ancestor)) {
          coveredByParent = true;
          break;
        }
        ancestor = parentFolderPath(ancestor);
      }
      return {
        path: node.path,
        name: node.name,
        count: node.count,
        depth: 0,
        hasChildren: node.children.length > 0,
        expanded: false,
        coveredByParent,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
