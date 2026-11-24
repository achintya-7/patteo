class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.4"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-darwin-arm64.tar.gz"
      sha256 "5b07d35b71d1db2c26f5d699f0ac9f0347e266ad3884803dd7ae536fed670a7e"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-darwin-x64.tar.gz"
      sha256 "d9cd21f3131756cf1fcef5898515fedf9a7bc1e9b6cff45dce13d1fe5be34610"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-linux-arm64.tar.gz"
      sha256 "1d17b5734ea41be62b0d5cb66b07a19be82ad3c6a30c9800d58402c4007053be"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-linux-x64.tar.gz"
      sha256 "f3779cf896353daf160c7119f9c65ab8446e192a30b66b1958748f5e4a2744bc"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
