(require 'json)
(require 'rect)
(let (results)
  (dolist (kind '(copy kill clear open))
    (with-temp-buffer
      (insert "abcde\nx\nabcde")
      (goto-char 2)
      (pcase kind
        ('copy (setq killed-rectangle (extract-rectangle 2 13)))
        ('kill (kill-rectangle 2 13))
        ('clear (clear-rectangle 2 13))
        ('open (open-rectangle 2 13)))
      (push `((kind . ,(symbol-name kind)) (text . ,(buffer-string)) (rows . ,(and (memq kind '(copy kill)) killed-rectangle))) results)))
  (princ (json-encode (nreverse results))))
