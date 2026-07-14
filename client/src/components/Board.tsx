const PIECE_GLYPHS: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function parseFenBoard(fen: string): (string | null)[][] {
  const placement = fen.split(" ")[0];
  const rows = placement.split("/");
  return rows.map((row) => {
    const squares: (string | null)[] = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i += 1) squares.push(null);
      } else {
        squares.push(char);
      }
    }
    return squares;
  });
}

export function Board({
  fen,
  lastMoveSquares,
  orientation = "white",
}: {
  fen: string;
  lastMoveSquares?: { from: string; to: string } | null;
  /** Which side sits at the bottom of the board — flip for players who had Black. */
  orientation?: "white" | "black";
}) {
  let board = parseFenBoard(fen);
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  if (orientation === "black") {
    board = board
      .slice()
      .reverse()
      .map((row) => row.slice().reverse());
  }

  return (
    <div className="board">
      {board.map((row, rowIndex) =>
        row.map((piece, colIndex) => {
          const rankIndex = orientation === "black" ? 7 - rowIndex : rowIndex;
          const fileIndex = orientation === "black" ? 7 - colIndex : colIndex;
          const square = `${files[fileIndex]}${8 - rankIndex}`;
          const isLight = (rankIndex + fileIndex) % 2 === 0;
          const isLastMove = lastMoveSquares && (square === lastMoveSquares.from || square === lastMoveSquares.to);
          const showFileLabel = rowIndex === 7;
          const showRankLabel = colIndex === 0;
          const isWhitePiece = piece !== null && piece === piece.toUpperCase();
          return (
            <div key={square} className={`board-square ${isLight ? "" : "dark"} ${isLastMove ? "last-move" : ""}`}>
              {piece ? <span className={`piece ${isWhitePiece ? "white-piece" : ""}`}>{PIECE_GLYPHS[piece]}</span> : null}
              {showFileLabel ? <span className="coord coord-file">{files[fileIndex]}</span> : null}
              {showRankLabel ? <span className="coord coord-rank">{8 - rankIndex}</span> : null}
            </div>
          );
        }),
      )}
    </div>
  );
}
