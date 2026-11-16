(require 'json)
(require 'rect)
(let (results)
  (dolist (kind '(copy kill delete clear open yank))
    (with-temp-buffer
      (fundamental-mode)
      (insert "abcde\nfghij\nklmno")
      (goto-char 3)
      (let ((start (point)) (end 10))
        (condition-case err
            (progn
              (pcase kind
                ('copy (setq killed-rectangle (extract-rectangle start end)))
                ('kill (kill-rectangle start end))
                ('delete (delete-rectangle start end))
                ('clear (clear-rectangle start end))
                ('open (open-rectangle start end))
                ('yank (setq killed-rectangle '("XY" "ZZ")) (yank-rectangle)))
              (push `((kind . ,(symbol-name kind)) (text . ,(buffer-string)) (point . ,(point)) (rectangle . ,(and (memq kind '(copy kill yank)) killed-rectangle))) results))
          (error (push `((kind . ,(symbol-name kind)) (error . ,(error-message-string err))) results))))))
  (princ (json-encode (nreverse results))))
