import { normalizeFolder } from './rules';

export type FolderNode = { path: string; name: string; count: number; children: FolderNode[] };
export type FolderTreeRow = Omit<FolderNode, 'children'> & { depth: number; hasChildren: boolean; expanded: boolean; coveredByParent: boolean };

export function buildFolderTree(folders: readonly { path: string; count: number }[], savedPaths: readonly string[] = []): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  function add(path: string, count = 0) {
    if (path && !nodes.has(path)) nodes.set(path, { path, name: path.slice(path.lastIndexOf('/') + 1), count, children: [] });
  }
  for (const folder of folders) add(normalizeFolder(folder.path), folder.count);
  for (const path of savedPaths) add(normalizeFolder(path));
  // Include ancestors of saved selections even if the current library has no songs there.
  for (const path of [...nodes.keys()]) {
    for (let slash = path.lastIndexOf('/'); slash > 0; slash = path.lastIndexOf('/', slash - 1)) add(path.slice(0, slash));
  }
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const slash = node.path.lastIndexOf('/');
    const parent = slash > 0 ? nodes.get(node.path.slice(0, slash)) : undefined;
    if (parent) parent.children.push(node);
    else { node.name = node.path; roots.push(node); }
  }
  function sort(children: FolderNode[]) {
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) sort(child.children);
  }
  sort(roots);
  return roots;
}

export function visibleFolderRows(tree: readonly FolderNode[], expanded: ReadonlySet<string>, selected: ReadonlySet<string>, term = '', selectedOnly = false): FolderTreeRow[] {
  const match = term.trim().normalize('NFKC').toLocaleLowerCase();
  const filtering = !!match || selectedOnly;
  function visit(node: FolderNode, depth: number, coveredByParent: boolean): FolderTreeRow[] {
    const selectedHere = selected.has(node.path);
    const isExpanded = expanded.has(node.path);
    const children = filtering || isExpanded ? node.children.flatMap(child => visit(child, depth + 1, coveredByParent || selectedHere)) : [];
    const matches = (!selectedOnly || selectedHere) && node.path.normalize('NFKC').toLocaleLowerCase().includes(match);
    if (filtering && !matches && !children.length) return [];
    const hasChildren = filtering ? children.length > 0 : node.children.length > 0;
    return [{ path: node.path, name: node.name, count: node.count, depth, hasChildren, expanded: hasChildren && (filtering || isExpanded), coveredByParent }, ...children];
  }
  return tree.flatMap(node => visit(node, 0, false));
}
