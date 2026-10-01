export type Expr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "path"; segments: PathSegment[] }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "unary"; op: "!" | "-"; expr: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "conditional"; cond: Expr; then: Expr; else: Expr };

export type PathSegment = { type: "prop"; name: string } | { type: "index"; expr: Expr };

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "&&"
  | "||"
  | "??";
