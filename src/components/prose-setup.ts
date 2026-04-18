import {
  keymap
} from "prosemirror-keymap"
import {
  history,
  undo,
  redo
} from "prosemirror-history"
import {
  baseKeymap,
  toggleMark,
  setBlockType,
  chainCommands,
  exitCode
} from "prosemirror-commands"
import {
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem
} from "prosemirror-schema-list"
import {
  Schema
} from "prosemirror-model"
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  smartQuotes,
  emDash,
  ellipsis,
  InputRule
} from "prosemirror-inputrules"

export function buildKeymap(schema: Schema) {
  let keys: any = {}
  function bind(key: string, cmd: any) {
    keys[key] = cmd
  }

  bind("Mod-z", undo)
  bind("Shift-Mod-z", redo)
  bind("Mod-y", redo)

  if (schema.marks.strong) bind("Mod-b", toggleMark(schema.marks.strong))
  if (schema.marks.em) bind("Mod-i", toggleMark(schema.marks.em))
  if (schema.marks.code) bind("Mod-`", toggleMark(schema.marks.code))

  if (schema.nodes.bullet_list) bind("Shift-Ctrl-8", wrapInList(schema.nodes.bullet_list))
  if (schema.nodes.ordered_list) bind("Shift-Ctrl-9", wrapInList(schema.nodes.ordered_list))
  if (schema.nodes.blockquote) bind("Ctrl->", wrapInList(schema.nodes.blockquote))
  
  if (schema.nodes.list_item) {
    bind("Enter", splitListItem(schema.nodes.list_item))
    bind("Mod-[", liftListItem(schema.nodes.list_item))
    bind("Mod-]", sinkListItem(schema.nodes.list_item))
  }
  
  if (schema.nodes.paragraph) bind("Shift-Ctrl-0", setBlockType(schema.nodes.paragraph))
  if (schema.nodes.code_block) bind("Shift-Ctrl-\\", setBlockType(schema.nodes.code_block))
  if (schema.nodes.heading) {
    for (let i = 1; i <= 6; i++) bind("Shift-Ctrl-" + i, setBlockType(schema.nodes.heading, {level: i}))
  }
  if (schema.nodes.horizontal_rule) {
    let hr = schema.nodes.horizontal_rule
    bind("Mod-_", (state: any, dispatch: any) => {
      dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView())
      return true
    })
  }

  return keys
}

export function buildInputRules(schema: Schema) {
  let rules = smartQuotes.concat(ellipsis, emDash)
  let type
  if (type = schema.nodes.blockquote) rules.push(wrappingInputRule(/^\s*>\s$/, type))
  if (type = schema.nodes.ordered_list) rules.push(wrappingInputRule(/^(\d+)\.\s$/, type, match => ({order: +match[1]}), (match, node) => node.childCount + node.attrs.order == +match[1]))
  if (type = schema.nodes.bullet_list) rules.push(wrappingInputRule(/^\s*([-+*])\s$/, type))
  if (type = schema.nodes.code_block) rules.push(textblockTypeInputRule(/^```$/, type))
  if (type = schema.nodes.heading) rules.push(textblockTypeInputRule(/^(#{1,6})\s$/, type, match => ({level: match[1].length})))
  if (type = schema.nodes.image) rules.push(new InputRule(/!\[(.*)\]\((.*)\)$/, (state, match, start, end) => {
    let alt = match[1], src = match[2]
    return state.tr.replaceWith(start, end, type.create({src, alt}))
  }))
  return inputRules({rules})
}
