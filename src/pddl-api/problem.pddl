(define (problem blocks-world-problem)
  (:domain blocks-world)
  
  (:objects
    A B C
  )
  
  (:init
    (ontable A)
    (ontable B)
    (ontable C)
    (clear A)
    (clear B)
    (clear C)
    (handempty)
  )
  
  (:goal
    (and
      (on A B)
      (on B C)
    )
  )
)
