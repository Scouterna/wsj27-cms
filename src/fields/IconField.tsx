'use client'

import React from 'react'
import type {
  DocumentPreferences,
  Field,
  Payload,
  FieldClientComponent,
  ClientFieldBase,
} from 'payload'
import { FieldLabel, useField } from '@payloadcms/ui'

type IconFieldComponentProps = {
  path: string
} & ClientFieldBase

export const IconField: FieldClientComponent = ({}) => {
  const { value, setValue } = useField<string>()

  return (
    // <div>
    //   <p>Value: {value}</p>
    //   <button onClick={() => setValue('A')}>Set A</button>
    //   <button onClick={() => setValue('B')}>Set B</button>
    // </div>

    <div className="field-type slug-field-component">
      {/* <div className="label-wrapper">
        <FieldLabel htmlFor={`field-${path}`} label={label} />

        <Button className="lock-button" buttonStyle="none" onClick={handleLock}>
          {checkboxValue ? 'Unlock' : 'Lock'}
        </Button>
      </div>

      <TextInput
        value={value}
        onChange={setValue}
        path={path || field.name}
        readOnly={Boolean(readOnly)}
      /> */}
    </div>
  )
}
