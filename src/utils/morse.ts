export const MORSE_DICT: Record<string, string> = {
  ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
  "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
  "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
  ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
  "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y",
  "--..": "Z", "-----": "0", ".----": "1", "..---": "2", "...--": "3",
  "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8",
  "----.": "9", ".-.-.-": ".", "--..--": ",", "---...": ":", "..--..": "?",
  ".----.": "'", "-....-": "-", "-..-.": "/", ".-..-.": "\"", ".--.-.": "@",
  "-...-": "=", ".-.-.": "+", "-.-.--": "!"
};

export const REVERSE_MORSE_DICT = Object.entries(MORSE_DICT).reduce((acc, [key, val]) => {
  acc[val] = key;
  return acc;
}, {} as Record<string, string>);

export function decodeMorse(morseCode: string): string {
  return morseCode
    .split(" / ") // words
    .map(word => 
      word.split(" ") // letters
        .map(letter => MORSE_DICT[letter] || "")
        .join("")
    )
    .join(" ");
}

export function encodeMorse(text: string): string {
  return text.toUpperCase()
    .split("")
    .map(char => {
      if (char === " ") return "/";
      return REVERSE_MORSE_DICT[char] || "";
    })
    .join(" ");
}
