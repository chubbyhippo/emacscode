(require 'json)
(require 'misc)
(let ((results nil))
  (dolist (case '(("abcAdefa!" 1 1 "a") ("abcAdefa!" 2 2 "a") ("abcAdefa!" 10 -1 "a") ("abcAdefa!" 10 -2 "a") ("abcAdefa!" 1 1 "A") ("abcAdefa!" 1 0 "a") ("abcAdefa!" 1 2 "z")))
    (with-temp-buffer
      (insert (nth 0 case))
      (goto-char (nth 1 case))
      (let ((kill-ring nil) (failure nil))
        (condition-case error
            (zap-to-char (nth 2 case) (string-to-char (nth 3 case)) t)
          (error (setq failure t)))
        (push `((text . ,(buffer-string)) (point . ,(point)) (kill . ,(car kill-ring)) (failure . ,(if failure t :json-false))) results))))
  (princ (json-encode (nreverse results))))
