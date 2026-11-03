# 第三方数据声明

本项目内置的 CET-4、CET-6 和 TEM-8（专八）词库转换自：

- Qwerty Learner: https://github.com/RealKai42/qwerty-learner
- 上游项目声明其英语词库源自 kajweb/dict，音标数据源自有道词典开放接口。
- Qwerty Learner 以 GNU General Public License v3.0 发布。

许可证全文保存在 `licenses/QWERTY-LEARNER-GPL-3.0.txt`。本地文件仅保留运行所需的单词、中文释义、音标和考试级别字段。

常用日中词库转换自：

- Japanese-Chinese-thesaurus: https://github.com/lxl66566/Japanese-Chinese-thesaurus
- 原始整合词库包含 12,716 条释义，以 Unlicense 发布。

许可证全文保存在 `licenses/JAPANESE-CHINESE-THESAURUS-UNLICENSE.txt`。构建时将日语词条拆分为假名读音、词性和中文释义，并建立假名别名索引。

## ECDICT

The general English-Chinese fallback dictionary is derived from ECDICT by skywind3000,
distributed under the MIT License. See `licenses/ECDICT-MIT.txt`.

## OPUS-MT and Transformers.js

The offline sentence translator uses the quantized ONNX conversion of
`Helsinki-NLP/opus-mt-en-zh` distributed for Transformers.js by Xenova.
The model is distributed under the Apache License 2.0.

The browser inference runtime is `@huggingface/transformers` 3.7.6 and its bundled
ONNX Runtime WebAssembly files, distributed under the Apache License 2.0.
See `licenses/TRANSFORMERS-JS-APACHE-2.0.txt`.

The bundled browser build is locally patched to omit an unused WebGPU adapter
probe (the extension explicitly runs OPUS-MT on WASM) and the unconditional
MarianTokenizer compatibility console warning. Model files and tokenization
behavior are unchanged.

## PDF.js and Mammoth

The offline document reader uses PDF.js 4.10.38 under the Apache License 2.0
and Mammoth 1.8.0 under the BSD 2-Clause License. Their license texts are in
`licenses/PDFJS-APACHE-2.0.txt` and `licenses/MAMMOTH-BSD-2-CLAUSE.txt`.
